import { describe, expect, it } from 'vitest';
import { asLocalDate, weekDays } from '../date';
import { newId } from '../ids';
import type { Activity, ActivityId, GoalId, WeeklyPlan, WeeklyPlanId } from '../types';
import { generateTasksForWeek } from './tasks';

const goalId = newId<GoalId>();
const monday = asLocalDate('2026-09-14'); // a Monday

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: newId<ActivityId>(),
    goalId,
    name: 'Workout',
    kind: 'session',
    role: 'input',
    unit: null,
    decimals: 0,
    defaultTarget: { aggregate: 'count', amount: 3, band: null, compare: null },
    scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [1, 3, 5], defaultMinutes: 45, stepTemplate: [] },
    color: null,
    sortOrder: 0,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function plan(targets: WeeklyPlan['targets']): WeeklyPlan {
  return {
    id: newId<WeeklyPlanId>(),
    goalId,
    weekStart: monday,
    weekStartsOn: 1,
    targets,
    outcomeBand: null,
    source: 'generated',
    tasksGeneratedAt: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('generateTasksForWeek', () => {
  it('places daysPerWeek tasks on the earliest matching preferred days', () => {
    const a = activity();
    const p = plan([{ activityId: a.id, aggregate: 'count', amount: 3, band: null }]);
    const tasks = generateTasksForWeek([a], p, weekDays(monday), { from: monday, to: null });
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.date)).toEqual(['2026-09-15', '2026-09-17', '2026-09-19']); // Tue/Thu/Sat = dayOfWeek 1,3,5
  });

  it('never generates more tasks than the (possibly prorated) target amount', () => {
    const a = activity(); // daysPerWeek: 3, preferredDays [1,3,5]
    const p = plan([{ activityId: a.id, aggregate: 'count', amount: 1, band: null }]); // prorated down to 1
    const tasks = generateTasksForWeek([a], p, weekDays(monday), { from: monday, to: null });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.date).toBe('2026-09-15'); // earliest matching day
  });

  it('places one task per listed weekday for fixedDays scheduling, every week', () => {
    const a = activity({ scheduling: { mode: 'fixedDays', days: [1, 3], defaultMinutes: 20, stepTemplate: [] } });
    const p = plan([{ activityId: a.id, aggregate: 'count', amount: 99, band: null }]); // target amount ignored
    const tasks = generateTasksForWeek([a], p, weekDays(monday), { from: monday, to: null });
    expect(tasks).toHaveLength(2);
  });

  it('generates no tasks for scheduling mode "none"', () => {
    const a = activity({ scheduling: { mode: 'none' } });
    const p = plan([{ activityId: a.id, aggregate: 'count', amount: 3, band: null }]);
    expect(generateTasksForWeek([a], p, weekDays(monday), { from: monday, to: null })).toHaveLength(0);
  });

  it('skips an archived activity even if it still has a target', () => {
    const a = activity({ archived: true });
    const p = plan([{ activityId: a.id, aggregate: 'count', amount: 3, band: null }]);
    expect(generateTasksForWeek([a], p, weekDays(monday), { from: monday, to: null })).toHaveLength(0);
  });

  it('embeds the step template on each generated task (spec §11 singing breakdown)', () => {
    const a = activity({
      name: 'Singing practice',
      scheduling: {
        mode: 'daysPerWeek',
        daysPerWeek: 1,
        preferredDays: [1],
        defaultMinutes: 30,
        stepTemplate: [
          { title: 'Breathing', minutes: 5 },
          { title: 'Vocal warm-up', minutes: 10 },
          { title: 'Song practice', minutes: 15 },
        ],
      },
    });
    const p = plan([{ activityId: a.id, aggregate: 'count', amount: 1, band: null }]);
    const tasks = generateTasksForWeek([a], p, weekDays(monday), { from: monday, to: null });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.steps.map((s) => s.title)).toEqual(['Breathing', 'Vocal warm-up', 'Song practice']);
    expect(tasks[0]!.steps.every((s) => !s.done)).toBe(true);
  });
});
