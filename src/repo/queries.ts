/**
 * Composite, multi-table READ queries that don't belong to one single entity's
 * repo file. Still repo/-only — the one place allowed to call getDb() directly.
 */
import { getDb } from '../db/database';
import { addWeeks, endOfWeek, resolveDeadline, startOfWeek, todayLocal } from '../domain/date';
import { goalProgress, summarizeWeek } from '../domain/progress';
import { latestEntry } from './entryRepo';
import type { Activity, DailyTask, Goal, GoalId, GoalProgress, LocalDate, TrackEntry, WeekStart, WeekSummary, WeeklyPlan } from '../domain/types';

export interface TodayScreenData {
  goals: Goal[];
  summaries: WeekSummary[];
  tasks: DailyTask[];
}

export async function todayScreenQuery(today: LocalDate, weekStartsOn: 0 | 1): Promise<TodayScreenData> {
  const db = getDb();
  const goals = await db.goals.where('status').equals('active').sortBy('sortOrder');
  const weekStart = startOfWeek(today, weekStartsOn);
  const weekEnd = endOfWeek(today, weekStartsOn);

  const summaries: WeekSummary[] = [];
  for (const goal of goals) {
    const activities = await db.activities.where('goalId').equals(goal.id).toArray();
    const plan = (await db.weeklyPlans.where('[goalId+weekStart]').equals([goal.id, weekStart]).first()) ?? null;
    const entries = await db.entries.where('[goalId+date]').between([goal.id, weekStart], [goal.id, weekEnd], true, true).toArray();
    summaries.push(summarizeWeek({ goal, activities, plan, entries, weekStart, today, weekStartsOn }));
  }

  const tasks = await db.tasks.where('date').equals(today).sortBy('sortOrder');
  return { goals, summaries, tasks };
}

export interface GoalsScreenRow {
  goal: Goal;
  progress: GoalProgress;
}

export async function goalsScreenQuery(): Promise<GoalsScreenRow[]> {
  const db = getDb();
  const today = todayLocal();
  const goals = await db.goals.where('status').equals('active').sortBy('sortOrder');
  const rows: GoalsScreenRow[] = [];
  for (const goal of goals) {
    const activities = await db.activities.where('goalId').equals(goal.id).toArray();
    const milestones = await db.milestones.where('goalId').equals(goal.id).toArray();
    const outcome = activities.find((a) => a.role === 'outcome');
    const latestOutcomeEntry = outcome ? await latestEntry(outcome.id) : null;
    rows.push({ goal, progress: goalProgress({ goal, activities, milestones, latestOutcomeEntry, today }) });
  }
  return rows;
}

export interface GoalDetailData {
  goal: Goal | null;
  activities: Awaited<ReturnType<typeof activitiesFor>>;
  milestones: Awaited<ReturnType<typeof milestonesFor>>;
  progress: GoalProgress | null;
  weekSummary: WeekSummary | null;
}

async function activitiesFor(db: ReturnType<typeof getDb>, goalId: Goal['id']) {
  return db.activities.where('goalId').equals(goalId).sortBy('sortOrder');
}
async function milestonesFor(db: ReturnType<typeof getDb>, goalId: Goal['id']) {
  return db.milestones.where('goalId').equals(goalId).sortBy('order');
}

export async function goalDetailQuery(goalId: Goal['id'], today: LocalDate, weekStartsOn: 0 | 1): Promise<GoalDetailData> {
  const db = getDb();
  const goal = (await db.goals.get(goalId)) ?? null;
  if (!goal) return { goal: null, activities: [], milestones: [], progress: null, weekSummary: null };

  const activities = await activitiesFor(db, goalId);
  const milestones = await milestonesFor(db, goalId);
  const outcome = activities.find((a) => a.role === 'outcome');
  const latestOutcomeEntry = outcome ? await latestEntry(outcome.id) : null;
  const progress = goalProgress({ goal, activities, milestones, latestOutcomeEntry, today });

  const weekStart = startOfWeek(today, weekStartsOn);
  const weekEnd = endOfWeek(today, weekStartsOn);
  const plan = (await db.weeklyPlans.where('[goalId+weekStart]').equals([goalId, weekStart]).first()) ?? null;
  const entries = await db.entries.where('[goalId+date]').between([goalId, weekStart], [goalId, weekEnd], true, true).toArray();
  const weekSummary = summarizeWeek({ goal, activities, plan, entries, weekStart, today, weekStartsOn });

  return { goal, activities, milestones, progress, weekSummary };
}

export interface WeekDetailRow {
  goal: Goal;
  plan: WeeklyPlan;
  activities: Activity[];
}

/** Every active goal's plan for one specific week — spec §10's Week Detail screen. */
export async function weekDetailQuery(weekStart: LocalDate): Promise<WeekDetailRow[]> {
  const db = getDb();
  const plans = await db.weeklyPlans.where('weekStart').equals(weekStart).toArray();
  const rows: WeekDetailRow[] = [];
  for (const plan of plans) {
    const goal = await db.goals.get(plan.goalId);
    if (!goal || goal.status !== 'active') continue;
    const activities = await db.activities.where('goalId').equals(plan.goalId).toArray();
    rows.push({ goal, plan, activities });
  }
  return rows;
}

export interface MetricChartData {
  entries: { date: LocalDate; value: number }[];
  startValue: number;
  targetValue: number;
  decimals: 0 | 1 | 2;
  unit: string;
  startDate: LocalDate;
  deadlineDate: LocalDate | null;
}

export interface WeekBarData {
  weekStart: LocalDate;
  actual: number;
  target: number;
  /** false when the week had no plan/target at all — distinct from a genuine 0%
   *  (spec's "no-data" vs "behind" distinction, EDGE-CASES.md D5/weekBand). */
  hasData: boolean;
}

export interface ProgressChartData {
  metric: MetricChartData | null;
  weeks: WeekBarData[];
  milestones: { id: string; title: string; done: boolean }[];
}

const CONSISTENCY_WEEKS = 8;

/** EC-M01: a day with two entries collapses to the latest-by-loggedAt one for charting. */
function collapseByDay(entries: TrackEntry[]): { date: LocalDate; value: number }[] {
  const byDay = new Map<LocalDate, TrackEntry>();
  for (const e of entries) {
    if (e.kind !== 'metric') continue;
    const existing = byDay.get(e.date);
    if (!existing || e.loggedAt > existing.loggedAt) byDay.set(e.date, e);
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, e]) => ({ date, value: e.kind === 'metric' ? e.value.n : 0 }));
}

export async function progressChartsQuery(goalId: GoalId, today: LocalDate, weekStartsOn: WeekStart): Promise<ProgressChartData> {
  const db = getDb();
  const goal = await db.goals.get(goalId);
  if (!goal) return { metric: null, weeks: [], milestones: [] };

  const activities = await db.activities.where('goalId').equals(goalId).toArray();
  const deadlineDate = goal.deadline ? resolveDeadline(goal.deadline) : null;

  let metric: MetricChartData | null = null;
  if (goal.type === 'metric') {
    const outcome = activities.find((a) => a.role === 'outcome');
    if (outcome) {
      const rawEntries = await db.entries.where('[activityId+date]').between([outcome.id, goal.startDate], [outcome.id, today], true, true).toArray();
      metric = { entries: collapseByDay(rawEntries), startValue: goal.config.startValue, targetValue: goal.config.targetValue, decimals: goal.config.decimals, unit: goal.config.unit, startDate: goal.startDate, deadlineDate };
    }
  }

  const currentWeekStart = startOfWeek(today, weekStartsOn);
  const earliestWeekStart = startOfWeek(goal.startDate, weekStartsOn);
  const firstWeek = addWeeks(currentWeekStart, -(CONSISTENCY_WEEKS - 1)) < earliestWeekStart ? earliestWeekStart : addWeeks(currentWeekStart, -(CONSISTENCY_WEEKS - 1));

  const weeks: WeekBarData[] = [];
  for (let w = firstWeek; w <= currentWeekStart; w = addWeeks(w, 1)) {
    const plan = (await db.weeklyPlans.where('[goalId+weekStart]').equals([goalId, w]).first()) ?? null;
    const weekEnd = endOfWeek(w, weekStartsOn);
    const entries = await db.entries.where('[goalId+date]').between([goalId, w], [goalId, weekEnd], true, true).toArray();
    const summary = summarizeWeek({ goal, activities, plan, entries, weekStart: w, today, weekStartsOn });
    weeks.push({ weekStart: w, actual: summary.adherence ?? 0, target: summary.adherence === null ? 0 : 1, hasData: summary.adherence !== null });
  }

  const milestonesRaw = await db.milestones.where('goalId').equals(goalId).sortBy('order');
  const milestones = milestonesRaw.map((m) => ({ id: m.id, title: m.title, done: m.status === 'done' }));

  return { metric, weeks, milestones };
}
