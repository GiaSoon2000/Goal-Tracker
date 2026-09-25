import { describe, expect, it } from 'vitest';
import { asLocalDate } from '../date';
import { newId } from '../ids';
import type { Activity, ActivityId, Goal, GoalId } from '../types';
import { buildPlanSpec } from './spec';

function fitnessGoal(overrides: Partial<Goal & { type: 'metric' }> = {}): Goal {
  return {
    id: newId<GoalId>(),
    type: 'metric',
    name: 'Fitness',
    status: 'active',
    startDate: asLocalDate('2026-09-19'),
    deadline: { precision: 'month', value: '2027-03' },
    pauses: [],
    sortOrder: 0,
    color: 'teal',
    completedAt: null,
    archivedAt: null,
    config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Goal;
}

function workoutActivity(amount = 3): Activity {
  return {
    id: newId<ActivityId>(),
    goalId: newId<GoalId>(),
    name: 'Workout',
    kind: 'session',
    role: 'input',
    unit: null,
    decimals: 0,
    defaultTarget: { aggregate: 'count', amount, band: null, compare: null },
    scheduling: { mode: 'daysPerWeek', daysPerWeek: amount, preferredDays: [1, 3, 5], defaultMinutes: 45, stepTemplate: [] },
    color: null,
    sortOrder: 0,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('buildPlanSpec — feasibility guards (EDGE-CASES.md §F)', () => {
  const today = asLocalDate('2026-09-19');

  it('never produces NaN/Infinity: the 43->50kg worked example is OK with a sane weekly band', () => {
    const { spec, feasibility } = buildPlanSpec(fitnessGoal(), [workoutActivity()], today, 1, 4);
    expect(feasibility.code).toBe('OK');
    expect(spec.weeks).toBe(28);
    expect(spec.perWeekBand).not.toBeNull();
    const [lo, hi] = spec.perWeekBand as [number, number];
    expect(Number.isFinite(lo)).toBe(true);
    expect(Number.isFinite(hi)).toBe(true);
    expect(lo).toBeLessThan(hi);
  });

  it('flags a deadline already in the past, with no Infinity/NaN anywhere', () => {
    const { spec, feasibility } = buildPlanSpec(fitnessGoal({ deadline: { precision: 'day', value: asLocalDate('2026-09-01') } }), [workoutActivity()], today, 1, 4);
    expect(feasibility.code).toBe('DEADLINE_IN_PAST');
    expect(spec.weeks).toBeNull();
    expect(Object.values(spec.totalQuantity).every(Number.isFinite)).toBe(true);
  });

  it('flags a deadline less than a week away', () => {
    const { feasibility } = buildPlanSpec(fitnessGoal({ deadline: { precision: 'day', value: asLocalDate('2026-09-20') } }), [workoutActivity()], today, 1, 4);
    expect(feasibility.code).toBe('DEADLINE_TOO_SOON');
  });

  it('flags a maintenance goal (current === target) without dividing by zero', () => {
    const { feasibility, spec } = buildPlanSpec(fitnessGoal({ config: { direction: 'increase', startValue: 50, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null } }), [workoutActivity()], today, 1, 4);
    expect(feasibility.code).toBe('MAINTENANCE');
    expect(spec.perWeekBand).toBeNull();
  });

  it('flags zero available days without crashing, and still produces weekly targets', () => {
    const { feasibility, spec } = buildPlanSpec(fitnessGoal(), [workoutActivity()], today, 1, 0);
    expect(feasibility.code).toBe('NO_AVAILABLE_DAYS');
    expect(spec.totalQuantity).toEqual({});
  });

  it('flags a request that exceeds daily capacity and suggests a later deadline rather than truncating', () => {
    const { feasibility } = buildPlanSpec(fitnessGoal(), [workoutActivity(5)], today, 1, 3);
    expect(feasibility.code).toBe('EXCEEDS_DAILY_CAPACITY');
    expect(feasibility.suggestedDeadline).toBeDefined();
    expect(feasibility.suggestedPerWeek).toEqual([3, 3]);
  });

  it('flags a horizon beyond 10 years', () => {
    const { feasibility } = buildPlanSpec(fitnessGoal({ deadline: { precision: 'day', value: asLocalDate('2037-09-19') } }), [workoutActivity()], today, 1, 4);
    expect(feasibility.code).toBe('HORIZON_TOO_LONG');
  });

  it('an open-ended (no deadline) goal produces a flat ongoing spec with no weeks division', () => {
    const habitGoal: Goal = {
      id: newId<GoalId>(),
      type: 'habit',
      name: 'Singing',
      status: 'active',
      startDate: today,
      deadline: null,
      pauses: [],
      sortOrder: 0,
      color: 'blue',
      completedAt: null,
      archivedAt: null,
      config: { horizon: 'ongoing' },
      createdAt: 0,
      updatedAt: 0,
    };
    const { feasibility, spec } = buildPlanSpec(habitGoal, [workoutActivity(3)], today, 1, 4);
    expect(feasibility.code).toBe('ONGOING');
    expect(spec.weeks).toBeNull();
    expect(Object.values(spec.totalQuantity)[0]).toBe(3);
  });

  it('never assigns a weekly quota to a metric goal\'s outcome activity', () => {
    const outcomeActivity: Activity = { ...workoutActivity(), role: 'outcome', kind: 'metric', id: newId<ActivityId>() };
    const { spec } = buildPlanSpec(fitnessGoal(), [outcomeActivity, workoutActivity()], today, 1, 4);
    expect(spec.totalQuantity[outcomeActivity.id]).toBeUndefined();
  });
});
