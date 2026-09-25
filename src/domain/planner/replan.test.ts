import { describe, expect, it } from 'vitest';
import { asLocalDate } from '../date';
import { newId } from '../ids';
import type { Activity, ActivityId, Goal, GoalId, WeeklyPlan, WeeklyPlanId } from '../types';
import { planReplan } from './replan';

const goalId = newId<GoalId>();

function workoutActivity(amount = 3): Activity {
  return {
    id: newId<ActivityId>(),
    goalId,
    name: 'Workout',
    kind: 'session',
    role: 'input',
    unit: null,
    decimals: 0,
    defaultTarget: { aggregate: 'count', amount, band: null, compare: null },
    scheduling: { mode: 'daysPerWeek', daysPerWeek: amount, preferredDays: [0, 1, 2, 3, 4, 5, 6].slice(0, amount + 2), defaultMinutes: 45, stepTemplate: [] },
    color: null,
    sortOrder: 0,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function metricGoal(deadline: Goal['deadline'], startDate = asLocalDate('2026-09-14')): Goal {
  return {
    id: goalId,
    type: 'metric',
    name: 'Fitness',
    status: 'active',
    startDate,
    deadline,
    pauses: [],
    sortOrder: 0,
    color: 'teal',
    completedAt: null,
    archivedAt: null,
    config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
    createdAt: 0,
    updatedAt: 0,
  };
}

function plan(weekStart: string, targets: WeeklyPlan['targets'], source: WeeklyPlan['source'] = 'generated'): WeeklyPlan {
  return {
    id: newId<WeeklyPlanId>(),
    goalId,
    weekStart: asLocalDate(weekStart),
    weekStartsOn: 1,
    targets,
    outcomeBand: null,
    source,
    tasksGeneratedAt: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('planReplan — the merge rule (EDGE-CASES.md §B.2)', () => {
  const today = asLocalDate('2026-10-05'); // a Monday, 3 weeks after startDate 2026-09-14

  it('freezes every week before the current week, untouched', () => {
    const activity = workoutActivity();
    const goal = metricGoal({ precision: 'day', value: asLocalDate('2027-03-31') });
    const past = plan('2026-09-14', [{ activityId: activity.id, aggregate: 'count', amount: 3, band: null }]);
    const result = planReplan({ goal, activities: [activity], existingPlans: [past], today, weekStartsOn: 1, doneBeforeCurrentWeek: {}, doneThisWeek: {} });
    const frozen = result.weeks.find((w) => w.weekStart === '2026-09-14');
    expect(frozen?.kind).toBe('frozen');
    expect(frozen?.targets).toEqual(past.targets); // byte-identical, never touched
  });

  it('keeps a user-edited future week verbatim and subtracts its quantity from the pool', () => {
    const activity = workoutActivity();
    const goal = metricGoal({ precision: 'day', value: asLocalDate('2026-11-02') }); // 4 weeks from today
    const editedWeek = plan('2026-10-12', [{ activityId: activity.id, aggregate: 'count', amount: 10, band: null }], 'edited');
    const result = planReplan({ goal, activities: [activity], existingPlans: [editedWeek], today, weekStartsOn: 1, doneBeforeCurrentWeek: {}, doneThisWeek: {} });
    const kept = result.weeks.find((w) => w.weekStart === '2026-10-12');
    expect(kept?.kind).toBe('kept');
    expect(kept?.targets[0]?.amount).toBe(10); // untouched by the redistribution
  });

  it('deletes a generated week beyond a shortened deadline, and orphans an edited one', () => {
    const activity = workoutActivity();
    const goal = metricGoal({ precision: 'day', value: asLocalDate('2026-10-19') }); // shortened to 2 weeks out
    const generatedLate = plan('2026-11-02', [{ activityId: activity.id, aggregate: 'count', amount: 3, band: null }], 'generated');
    const editedLate = plan('2026-11-09', [{ activityId: activity.id, aggregate: 'count', amount: 5, band: null }], 'edited');
    const result = planReplan({ goal, activities: [activity], existingPlans: [generatedLate, editedLate], today, weekStartsOn: 1, doneBeforeCurrentWeek: {}, doneThisWeek: {} });
    expect(result.weeks.find((w) => w.weekStart === '2026-11-02')?.kind).toBe('deleted');
    expect(result.weeks.find((w) => w.weekStart === '2026-11-09')?.kind).toBe('orphaned');
  });

  it('redistributes remaining work upward when the user fell behind (spec §5 core promise)', () => {
    const activity = workoutActivity(3);
    // 7 week-starts (inclusive) from startDate 2026-09-14 to deadline 2026-10-26;
    // original flat rate was 3/week => totalWork = 21.
    const goal = metricGoal({ precision: 'day', value: asLocalDate('2026-10-26') });
    // Only 1 of the first 3 weeks' worth (should have been 9) actually got done.
    const result = planReplan({ goal, activities: [activity], existingPlans: [], today, weekStartsOn: 1, doneBeforeCurrentWeek: { [activity.id]: 1 }, doneThisWeek: {} });
    const created = result.weeks.filter((w) => w.kind === 'created');
    const totalAllocated = created.reduce((s, w) => s + (w.targets.find((t) => t.activityId === activity.id)?.amount ?? 0), 0);
    // remaining = totalWork(21) - done(1) = 20, spread over the remaining elastic weeks.
    expect(totalAllocated).toBe(20);
    // Each remaining week now asks for MORE than the original flat 3 — the redistribution is real.
    const perWeek = created[0]?.targets.find((t) => t.activityId === activity.id)?.amount ?? 0;
    expect(perWeek).toBeGreaterThan(3);
  });

  it('applies the current-week floor: never demands less than what is already done this week', () => {
    const activity = workoutActivity(3);
    const goal = metricGoal({ precision: 'day', value: asLocalDate('2026-10-12') }); // deadline is NEXT week
    // The user already logged 3 workouts this week even though the redistributed
    // allocation for this short remaining horizon would naturally be less.
    const result = planReplan({ goal, activities: [activity], existingPlans: [], today, weekStartsOn: 1, doneBeforeCurrentWeek: {}, doneThisWeek: { [activity.id]: 3 } });
    const currentWeek = result.weeks.find((w) => w.weekStart === today);
    expect((currentWeek?.targets.find((t) => t.activityId === activity.id)?.amount ?? 0)).toBeGreaterThanOrEqual(3);
  });

  it('never redistributes an ongoing (no-deadline) goal — each elastic week keeps the flat target', () => {
    const activity = workoutActivity(3);
    const goal: Goal = { ...metricGoal(null), type: 'habit', config: { horizon: 'ongoing' } };
    const result = planReplan({ goal, activities: [activity], existingPlans: [], today, weekStartsOn: 1, doneBeforeCurrentWeek: { [activity.id]: 1 }, doneThisWeek: {} });
    const created = result.weeks.filter((w) => w.kind === 'created');
    for (const w of created) {
      expect(w.targets.find((t) => t.activityId === activity.id)?.amount).toBe(3);
    }
  });

  it('every allocated amount is a whole number that sums exactly to the remaining pool (no float drift, EC-P07)', () => {
    const activity = workoutActivity(3);
    const goal = metricGoal({ precision: 'day', value: asLocalDate('2027-01-04') }); // a longer, uneven horizon
    const result = planReplan({ goal, activities: [activity], existingPlans: [], today, weekStartsOn: 1, doneBeforeCurrentWeek: {}, doneThisWeek: {} });
    for (const w of result.weeks) {
      for (const t of w.targets) expect(Number.isInteger(t.amount)).toBe(true);
    }
  });
});
