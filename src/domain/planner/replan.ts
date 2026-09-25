/**
 * Re-planning — redistributes remaining work across the remaining elastic weeks
 * when a deadline changes or the user falls behind (spec §5). The merge rule:
 * weeks before the current week are frozen; user-edited future weeks are kept
 * verbatim and their quantity is subtracted from the pool; everything else is
 * replaced or newly created from an even split of what's left. See
 * PLANNING-ENGINE.md §7 / EDGE-CASES.md §B.2 for the design.
 */
import { addWeeks, eachWeekStart, resolveDeadline, startOfWeek, weeksBetween } from '../date';
import { allocateLargestRemainder } from './allocate';
import { activityWeekWeight } from './weekTargets';
import type { Activity, ActivityId, Goal, LocalDate, WeekStart, WeeklyPlan, WeeklyPlanId, WeeklyTarget } from '../types';

export type ReplanWeekKind = 'frozen' | 'kept' | 'replaced' | 'created' | 'deleted' | 'orphaned';

export interface ReplanWeekDiff {
  weekStart: LocalDate;
  kind: ReplanWeekKind;
  /** null only for a brand-new ('created') week. */
  planId: WeeklyPlanId | null;
  /** The resulting targets — meaningful for kept/replaced/created; [] otherwise. */
  targets: WeeklyTarget[];
}

export interface ReplanResult {
  weeks: ReplanWeekDiff[];
  /** true when the current-week floor (spec/EC-L03) had to clamp a later week to 0 —
   *  i.e. the math could not perfectly reconcile the remaining pool. Surfaced, not hidden. */
  tight: boolean;
}

export interface ReplanInput {
  goal: Goal;
  activities: Activity[];
  /** Every persisted week for this goal, any source. */
  existingPlans: WeeklyPlan[];
  today: LocalDate;
  weekStartsOn: WeekStart;
  /** Actual aggregate per input activity, summed over [goal.startDate, currentWeekStart). */
  doneBeforeCurrentWeek: Record<string, number>;
  /** Actual aggregate per input activity, summed within the current week so far. */
  doneThisWeek: Record<string, number>;
}

/** Matches PLANNING-ENGINE.md §9's rolling materialization window. */
export const REPLAN_WINDOW_WEEKS = 8;

export function planReplan(input: ReplanInput): ReplanResult {
  const { goal, activities, existingPlans, today, weekStartsOn, doneBeforeCurrentWeek, doneThisWeek } = input;
  const cw = startOfWeek(today, weekStartsOn);
  const deadlineDate = goal.deadline ? resolveDeadline(goal.deadline) : null;
  const dw = deadlineDate ? startOfWeek(deadlineDate, weekStartsOn) : null;
  const horizonEnd = dw ?? addWeeks(cw, REPLAN_WINDOW_WEEKS - 1);

  const byWeekStart = new Map(existingPlans.map((p) => [p.weekStart, p]));
  const weeks: ReplanWeekDiff[] = [];
  const committed: Record<string, number> = {};

  for (const p of existingPlans) {
    if (p.weekStart < cw) {
      weeks.push({ weekStart: p.weekStart, kind: 'frozen', planId: p.id, targets: p.targets });
    } else if (p.weekStart > horizonEnd) {
      weeks.push({ weekStart: p.weekStart, kind: p.source === 'edited' ? 'orphaned' : 'deleted', planId: p.id, targets: p.targets });
    }
  }

  const windowWeekStarts = eachWeekStart(cw, horizonEnd);
  const elasticWeekStarts: LocalDate[] = [];
  for (const ws of windowWeekStarts) {
    const existing = byWeekStart.get(ws);
    if (existing && existing.source === 'edited') {
      weeks.push({ weekStart: ws, kind: 'kept', planId: existing.id, targets: existing.targets });
      for (const t of existing.targets) committed[t.activityId] = (committed[t.activityId] ?? 0) + t.amount;
    } else {
      elasticWeekStarts.push(ws);
    }
  }

  let tight = false;
  const allocatedByWeek = new Map<LocalDate, WeeklyTarget[]>(elasticWeekStarts.map((ws) => [ws, []]));

  for (const activity of activities) {
    if (activity.role !== 'input' || !activity.defaultTarget) continue;
    const weights = elasticWeekStarts.map((ws) => activityWeekWeight(activity, ws, goal.startDate, deadlineDate));

    let allocated: number[];
    if (deadlineDate && dw) {
      const totalWeeks = Math.max(1, weeksBetween(startOfWeek(goal.startDate, weekStartsOn), dw) + 1);
      const totalWork = activity.defaultTarget.amount * totalWeeks;
      const done = doneBeforeCurrentWeek[activity.id] ?? 0;
      const alreadyCommitted = committed[activity.id] ?? 0;
      const remaining = Math.max(0, totalWork - done - alreadyCommitted);
      allocated = allocateLargestRemainder(remaining, weights);
    } else {
      // Ongoing (no deadline): no pool to redistribute — each week repeats the flat target.
      allocated = weights.map((w) => Math.round(activity.defaultTarget!.amount * w));
    }

    // Current-week floor (spec §5 / EC-L03): re-planning must never demand less than
    // what is already done this week. Any excess is pulled from the LAST elastic week.
    const cwIndex = elasticWeekStarts.indexOf(cw);
    if (cwIndex !== -1) {
      const doneNow = doneThisWeek[activity.id] ?? 0;
      const floorAmount = allocated[cwIndex] ?? 0;
      if (doneNow > floorAmount) {
        const excess = doneNow - floorAmount;
        allocated[cwIndex] = doneNow;
        const lastIndex = allocated.length - 1;
        if (lastIndex >= 0 && lastIndex !== cwIndex) {
          const lastVal = allocated[lastIndex] ?? 0;
          const reduced = Math.max(0, lastVal - excess);
          if (reduced === 0 && excess > lastVal) tight = true;
          allocated[lastIndex] = reduced;
        } else {
          tight = true;
        }
      }
    }

    // A redistributed target can legitimately exceed how many task slots the
    // activity's fixed weekly schedule can place (spec's "never silently truncate"
    // — see EDGE-CASES.md EC-P05). The number stays honest; `tight` flags that the
    // catch-up pace needs more than the scheduled days, so the UI can say so rather
    // than silently understate the target or silently drop the shortfall.
    if (activity.scheduling.mode === 'daysPerWeek') {
      const fullWeekSlots = Math.min(activity.scheduling.daysPerWeek, activity.scheduling.preferredDays.length);
      elasticWeekStarts.forEach((_ws, i) => {
        const capacity = Math.round(fullWeekSlots * (weights[i] ?? 0));
        if ((allocated[i] ?? 0) > capacity) tight = true;
      });
    }

    elasticWeekStarts.forEach((ws, i) => {
      allocatedByWeek.get(ws)!.push({ activityId: activity.id as ActivityId, aggregate: activity.defaultTarget!.aggregate, amount: allocated[i] ?? 0, band: activity.defaultTarget!.band });
    });
  }

  for (const ws of elasticWeekStarts) {
    const existing = byWeekStart.get(ws);
    weeks.push({ weekStart: ws, kind: existing ? 'replaced' : 'created', planId: existing?.id ?? null, targets: allocatedByWeek.get(ws) ?? [] });
  }

  weeks.sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0));
  return { weeks, tight };
}
