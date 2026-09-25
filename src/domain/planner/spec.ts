/**
 * Feasibility and weekly-total computation. Every division is guarded BEFORE it
 * runs — no NaN/Infinity ever escapes this module (EDGE-CASES.md EC-P01-P06).
 */
import { addDays, diffDays, resolveDeadline, weeksBetween } from '../date';
import type { Activity, Deadline, Goal, LocalDate, WeekStart } from '../types';

/** Pick<Goal, ...> would collapse the type/config discriminated union — keep the full Goal. */
export type PlanGoalInput = Goal;

export type FeasibilityCode =
  | 'OK'
  | 'TIGHT'
  | 'MAINTENANCE'
  | 'DEADLINE_IN_PAST'
  | 'DEADLINE_TOO_SOON'
  | 'NO_AVAILABLE_DAYS'
  | 'EXCEEDS_DAILY_CAPACITY'
  | 'HORIZON_TOO_LONG'
  | 'ONGOING';

export interface Feasibility {
  code: FeasibilityCode;
  message: string;
  suggestedDeadline?: LocalDate;
  /** A RANGE, never a single prediction (spec §4). */
  suggestedPerWeek?: [number, number];
}

export interface PlanSpec {
  weekStartsOn: WeekStart;
  planStartWeek: LocalDate;
  deadlineWeek: LocalDate | null;
  weeks: number | null;
  availableDaysPerWeek: number;
  /** Per-activity weekly quota, scaled across the horizon (skipped entirely for a
   *  metric goal's outcome activity — see perWeekBand instead). */
  totalQuantity: Record<string, number>;
  /** Metric-goal outcome trajectory only: a range, never a point estimate. */
  perWeekBand: [number, number] | null;
}

export const MAX_PLAN_WEEKS = 520; // ~10 years
const MIN_WEEKS_FOR_A_PLAN = 1;

function feasible(spec: PlanSpec, code: FeasibilityCode = 'OK', message = 'Looks good.'): { spec: PlanSpec; feasibility: Feasibility } {
  return { spec, feasibility: { code, message } };
}

export function buildPlanSpec(
  goal: PlanGoalInput,
  activities: Pick<Activity, 'id' | 'defaultTarget' | 'role'>[],
  today: LocalDate,
  weekStartsOn: WeekStart,
  availableDaysPerWeek: number,
): { spec: PlanSpec; feasibility: Feasibility } {
  const planStartWeek = today;
  const emptySpec = (deadlineWeek: LocalDate | null, weeks: number | null): PlanSpec => ({
    weekStartsOn,
    planStartWeek,
    deadlineWeek,
    weeks,
    availableDaysPerWeek,
    totalQuantity: {},
    perWeekBand: null,
  });

  if (availableDaysPerWeek <= 0) {
    const spec = emptySpec(goal.deadline ? resolveDeadline(goal.deadline) : null, null);
    return { spec, feasibility: { code: 'NO_AVAILABLE_DAYS', message: 'No days available — targets exist but no daily tasks will be generated.' } };
  }

  if (!goal.deadline) {
    // Open-ended habit/skill goal: flat per-week targets forever, no weeks division needed.
    const spec = emptySpec(null, null);
    spec.totalQuantity = totalQuantityForOngoing(activities);
    return feasible(spec, 'ONGOING', 'This goal has no deadline — targets repeat every week.');
  }

  const deadline = resolveDeadline(goal.deadline);
  if (deadline < today) {
    return { spec: emptySpec(deadline, null), feasibility: { code: 'DEADLINE_IN_PAST', message: 'This deadline has already passed.' } };
  }

  const days = diffDays(today, deadline);
  if (days < 7 * MIN_WEEKS_FOR_A_PLAN) {
    return { spec: emptySpec(deadline, 0), feasibility: { code: 'DEADLINE_TOO_SOON', message: 'This deadline is less than a week away.' } };
  }

  const weeks = Math.max(1, weeksBetween(today, deadline));
  if (weeks > MAX_PLAN_WEEKS) {
    return {
      spec: emptySpec(deadline, weeks),
      feasibility: { code: 'HORIZON_TOO_LONG', message: 'Deadlines more than 10 years out are not supported.' },
    };
  }

  const spec = emptySpec(deadline, weeks);
  spec.totalQuantity = totalQuantityForHorizon(activities, weeks);

  if (goal.type === 'metric') {
    const { startValue, targetValue } = goal.config;
    if (startValue === targetValue) {
      return feasible(spec, 'MAINTENANCE', 'This goal is about maintaining, not changing, the value.');
    }
    const weeklyDelta = (targetValue - startValue) / weeks;
    spec.perWeekBand = [weeklyDelta * 0.6, weeklyDelta * 1.4];
  }

  // Capacity check on habit-like input activities: can the requested sessions/week
  // fit inside the available days? Never silently truncate — surface it instead.
  for (const a of activities) {
    if (a.role !== 'input' || !a.defaultTarget || a.defaultTarget.aggregate !== 'count') continue;
    const requested = a.defaultTarget.amount;
    if (requested > availableDaysPerWeek) {
      // At the clamped rate (availableDaysPerWeek/week instead of requested/week), the same
      // total quantity takes requested/availableDaysPerWeek times as many weeks.
      const stretchFactor = requested / availableDaysPerWeek;
      const suggestedDeadline = addDays(today, Math.round(days * stretchFactor));
      return {
        spec,
        feasibility: {
          code: 'EXCEEDS_DAILY_CAPACITY',
          message: `${availableDaysPerWeek} day(s) a week fits fewer sessions than requested.`,
          suggestedDeadline,
          suggestedPerWeek: [availableDaysPerWeek, availableDaysPerWeek],
        },
      };
    }
  }

  return feasible(spec);
}

function totalQuantityForHorizon(activities: Pick<Activity, 'id' | 'defaultTarget' | 'role'>[], weeks: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of activities) {
    if (a.role === 'outcome') continue; // metric outcome uses perWeekBand, never a quota
    if (!a.defaultTarget) continue;
    out[a.id] = a.defaultTarget.amount * weeks;
  }
  return out;
}

function totalQuantityForOngoing(activities: Pick<Activity, 'id' | 'defaultTarget' | 'role'>[]): Record<string, number> {
  // Ongoing goals repeat the same flat weekly amount forever — "total" is just that one week's amount.
  const out: Record<string, number> = {};
  for (const a of activities) {
    if (a.role === 'outcome' || !a.defaultTarget) continue;
    out[a.id] = a.defaultTarget.amount;
  }
  return out;
}

export function resolveDeadlineOrNull(deadline: Deadline | null): LocalDate | null {
  return deadline ? resolveDeadline(deadline) : null;
}
