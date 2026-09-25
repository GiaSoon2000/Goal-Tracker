import { describe, expect, it } from 'vitest';
import { asLocalDate } from '../date';
import { newId } from '../ids';
import type { Activity, ActivityId, GoalId } from '../types';
import { weekTargetsFor } from './weekTargets';

function workoutActivity(): Activity {
  return {
    id: newId<ActivityId>(),
    goalId: newId<GoalId>(),
    name: 'Workout',
    kind: 'session',
    role: 'input',
    unit: null,
    decimals: 0,
    defaultTarget: { aggregate: 'count', amount: 3, band: null, compare: null },
    scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [1, 3, 5], defaultMinutes: 45, stepTemplate: [] }, // Tue/Thu/Sat
    color: null,
    sortOrder: 0,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('weekTargetsFor — first/last partial week proration (EDGE-CASES.md EC-T08/EC-T09)', () => {
  it('gives the full target for a week entirely inside [startDate, deadline]', () => {
    const a = workoutActivity();
    const weekStart = asLocalDate('2026-09-14'); // Monday
    const targets = weekTargetsFor([a], weekStart, 1, asLocalDate('2026-09-01'), asLocalDate('2027-03-31'));
    expect(targets[0]!.amount).toBe(3);
  });

  it('prorates the first week when the goal starts mid-week (spec worked example: created Sat, 1 day left)', () => {
    const a = workoutActivity();
    const weekStart = asLocalDate('2026-09-14'); // Mon 14 - Sun 20
    const startDate = asLocalDate('2026-09-19'); // Saturday — only Sat (dayOfWeek 5) remains, matches preferredDays
    const targets = weekTargetsFor([a], weekStart, 1, startDate, asLocalDate('2027-03-31'));
    // 1 of 3 preferred days remains (Sat) -> round(3 * 1/3) = 1
    expect(targets[0]!.amount).toBe(1);
  });

  it('prorates the last week when the deadline falls mid-week', () => {
    const a = workoutActivity();
    const weekStart = asLocalDate('2027-03-29'); // Mon 29 - Sun Apr 4
    const deadline = asLocalDate('2027-03-31'); // Wednesday — only Tue(30th, not preferred) ... check Tue=30 not in [1,3,5]
    // preferredDays [1,3,5] = Tue,Thu,Sat -> within Mon29..Wed31 only Tue30 matches -> 1 of 3 slots
    const targets = weekTargetsFor([a], weekStart, 1, asLocalDate('2026-09-01'), deadline);
    expect(targets[0]!.amount).toBe(1);
  });

  it('never generates a target for the outcome activity of a metric goal', () => {
    const outcome: Activity = { ...workoutActivity(), role: 'outcome', kind: 'metric', id: newId<ActivityId>() };
    const targets = weekTargetsFor([outcome], asLocalDate('2026-09-14'), 1, asLocalDate('2026-09-01'), asLocalDate('2027-03-31'));
    expect(targets).toHaveLength(0);
  });

  it('leaves fixedDays/none-scheduled activities at their flat target (no proration concept)', () => {
    const a: Activity = { ...workoutActivity(), scheduling: { mode: 'fixedDays', days: [1, 3], defaultMinutes: null, stepTemplate: [] } };
    const targets = weekTargetsFor([a], asLocalDate('2026-09-14'), 1, asLocalDate('2026-09-19'), asLocalDate('2027-03-31'));
    expect(targets[0]!.amount).toBe(3);
  });
});
