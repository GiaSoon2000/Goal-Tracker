/**
 * Pure, array-in / value-out, no IndexedDB. This is where "Progress: 7%" and
 * "On track / Behind / Ahead" (spec §8/§9) are computed — see DATA-MODEL.md §3.2
 * and PLANNING-ENGINE.md §6 for the reasoning behind each formula.
 */
import { diffDays, endOfWeek, resolveDeadline } from './date';
import { clamp01, nearlyEqual } from './num';
import { toNumber } from './trackKinds';
import type {
  Activity,
  DailyTask,
  Goal,
  GoalProgress,
  LocalDate,
  Milestone,
  TargetAggregate,
  TrackEntry,
  TrackStatus,
  WeekActivityRow,
  WeekStart,
  WeekSummary,
  WeeklyPlan,
} from './types';

export function aggregate(entries: TrackEntry[], agg: TargetAggregate): number {
  if (entries.length === 0) return 0;
  switch (agg) {
    case 'count':
      return entries.length;
    case 'sum':
      return entries.reduce((sum, e) => sum + toNumber(e.kind, e.value), 0);
    case 'latest': {
      const sorted = [...entries].sort((a, b) => (a.date === b.date ? a.loggedAt - b.loggedAt : a.date < b.date ? -1 : 1));
      const last = sorted[sorted.length - 1];
      return last ? toNumber(last.kind, last.value) : 0;
    }
    case 'mean':
      return entries.reduce((sum, e) => sum + toNumber(e.kind, e.value), 0) / entries.length;
  }
}

/**
 * Time-prorated status: compares against slots that have ALREADY elapsed, not the
 * whole week. This is the fix for "every user reads Behind on Monday morning" —
 * with elapsedSlots === 0 the result is 'no_target' (rendered as "—"), never 'behind'.
 */
export function weekStatus(actual: number, target: number | null, elapsedFraction: number): TrackStatus {
  if (target === null || target <= 0) return 'no_target';
  const expected = target * Math.min(1, Math.max(0, elapsedFraction));
  if (expected <= 0) return 'no_target';
  const ratio = actual / expected;
  if (ratio >= 1.15) return 'ahead';
  if (ratio >= 0.85) return 'on_track';
  return 'behind';
}

/** Fraction of the week (0..1) that has elapsed as of `today`, for time-prorated status. */
export function weekElapsedFraction(weekStart: LocalDate, today: LocalDate, weekStartsOn: WeekStart): number {
  const end = endOfWeek(weekStart, weekStartsOn);
  const clampedToday = today < weekStart ? weekStart : today > end ? end : today;
  return (diffDays(weekStart, clampedToday) + 1) / 7;
}

export function summarizeWeek(args: {
  goal: Goal;
  activities: Activity[];
  plan: WeeklyPlan | null;
  entries: TrackEntry[]; // already range-filtered to the week
  weekStart: LocalDate;
  today: LocalDate;
  weekStartsOn: WeekStart;
}): WeekSummary {
  const { goal, activities, plan, entries, weekStart, today, weekStartsOn } = args;
  const elapsedFraction = weekElapsedFraction(weekStart, today, weekStartsOn);
  const entriesByActivity = new Map<string, TrackEntry[]>();
  for (const e of entries) {
    const list = entriesByActivity.get(e.activityId) ?? [];
    list.push(e);
    entriesByActivity.set(e.activityId, list);
  }

  const rows: WeekActivityRow[] = activities
    .filter((a) => !a.archived)
    .map((a) => {
      const target = plan?.targets.find((t) => t.activityId === a.id) ?? null;
      const activityEntries = entriesByActivity.get(a.id) ?? [];
      const agg = target?.aggregate ?? a.defaultTarget?.aggregate ?? 'count';
      const actual = aggregate(activityEntries, agg);
      const targetAmount = target?.amount ?? null;
      return {
        activityId: a.id,
        name: a.name,
        kind: a.kind,
        aggregate: agg,
        unit: a.unit,
        target: targetAmount,
        band: target?.band ?? null,
        actual,
        status: weekStatus(actual, targetAmount, elapsedFraction),
      };
    });

  const inputRows = rows.filter((r) => activities.find((a) => a.id === r.activityId)?.role === 'input' && r.target !== null);
  let adherence: number | null = null;
  if (inputRows.length > 0) {
    const totalTarget = inputRows.reduce((s, r) => s + (r.target ?? 0), 0);
    if (totalTarget > 0) {
      const totalCapped = inputRows.reduce((s, r) => s + Math.min(r.actual, r.target ?? 0), 0);
      adherence = totalCapped / totalTarget;
    }
  }

  const overallActual = inputRows.reduce((s, r) => s + r.actual, 0);
  const overallTarget = inputRows.reduce((s, r) => s + (r.target ?? 0), 0);
  const status = weekStatus(overallActual, overallTarget || null, elapsedFraction);

  return { goalId: goal.id, weekStart, rows, adherence, status };
}

/**
 * Metric goal ratio, sign-agnostic so it works for both increase and decrease
 * goals: clamp01((current - start) / (target - start)). null when target === start
 * (a maintenance goal — see EDGE-CASES.md EC-P02).
 */
export function metricRatio(startValue: number, targetValue: number, currentValue: number): number | null {
  if (nearlyEqual(startValue, targetValue)) return null;
  return clamp01((currentValue - startValue) / (targetValue - startValue));
}

export function goalProgress(args: {
  goal: Goal;
  activities: Activity[];
  milestones: Milestone[];
  latestOutcomeEntry: TrackEntry | null;
  today: LocalDate;
}): GoalProgress {
  const { goal, milestones, latestOutcomeEntry, today } = args;
  const sortedMilestones = [...milestones].sort((a, b) => a.order - b.order);
  const milestonesDone = sortedMilestones.filter((m) => m.status === 'done').length;
  const currentMilestone = sortedMilestones.find((m) => m.status !== 'done' && m.status !== 'skipped') ?? sortedMilestones[sortedMilestones.length - 1] ?? null;
  const deadlineDate = goal.deadline ? resolveDeadline(goal.deadline) : null;
  const daysRemaining = deadlineDate ? diffDays(today, deadlineDate) : null;

  let ratio: number | null = null;
  let currentValue: number | null = null;
  let targetValue: number | null = null;
  let unit: string | null = null;

  if (goal.type === 'metric') {
    const { startValue, targetValue: tv, unit: u } = goal.config;
    currentValue = latestOutcomeEntry && latestOutcomeEntry.kind === 'metric' ? latestOutcomeEntry.value.n : startValue;
    targetValue = tv;
    unit = u;
    ratio = metricRatio(startValue, tv, currentValue);
  } else if (goal.type === 'skill') {
    const { levelScale, currentLevel } = goal.config;
    if (levelScale && levelScale.length > 1) {
      const idx = levelScale.indexOf(currentLevel);
      ratio = idx >= 0 ? clamp01(idx / (levelScale.length - 1)) : null;
    } else if (sortedMilestones.length > 0) {
      ratio = milestoneRatio(sortedMilestones);
    }
  } else if (goal.type === 'project') {
    if (sortedMilestones.length > 0) ratio = milestoneRatio(sortedMilestones);
  }
  // habit goals: ratio stays null — an open-ended goal has no completion percentage (§13).

  return {
    goalId: goal.id,
    ratio,
    currentValue,
    targetValue,
    unit,
    milestonesDone,
    milestonesTotal: sortedMilestones.length,
    daysRemaining,
    currentMilestone,
  };
}

function milestoneRatio(milestones: Milestone[]): number {
  const totalWeight = milestones.reduce((s, m) => s + m.weight, 0);
  if (totalWeight === 0) return 0;
  const doneWeight = milestones.filter((m) => m.status === 'done').reduce((s, m) => s + m.weight, 0);
  return clamp01(doneWeight / totalWeight);
}

/** Distinct task states with different arithmetic (spec §11; EDGE-CASES.md D4/D5). */
export type DisplayTaskStatus = 'pending' | 'done' | 'skipped' | 'missed';

export function displayTaskStatus(task: Pick<DailyTask, 'date' | 'status'>, today: LocalDate, isPausedOn: (d: LocalDate) => boolean): DisplayTaskStatus {
  if (task.status !== 'pending') return task.status;
  if (task.date >= today) return 'pending';
  if (isPausedOn(task.date)) return 'pending'; // a paused day can never be missed
  return 'missed';
}

export interface WeekTally {
  done: number;
  skipped: number;
  missed: number;
  pending: number;
  planned: number;
}

export function tallyWeek(tasks: DailyTask[], today: LocalDate, isPausedOn: (d: LocalDate) => boolean): WeekTally {
  const tally: WeekTally = { done: 0, skipped: 0, missed: 0, pending: 0, planned: tasks.length };
  for (const t of tasks) {
    const status = displayTaskStatus(t, today, isPausedOn);
    tally[status]++;
  }
  return tally;
}

/** null when the denominator is 0 — render "—", never 0% or NaN%. */
export function adherenceFromTally(t: WeekTally): number | null {
  const d = t.done + t.missed;
  return d === 0 ? null : t.done / d;
}

export function isDateInPause(date: LocalDate, pauses: { from: LocalDate; to: LocalDate | null }[]): boolean {
  return pauses.some((p) => date >= p.from && (p.to === null || date <= p.to));
}

export function isWeekStartWithinPause(weekStart: LocalDate, weekStartsOn: WeekStart, pauses: { from: LocalDate; to: LocalDate | null }[]): boolean {
  const end = endOfWeek(weekStart, weekStartsOn);
  return pauses.some((p) => !(end < p.from) && !(p.to !== null && weekStart > p.to));
}
