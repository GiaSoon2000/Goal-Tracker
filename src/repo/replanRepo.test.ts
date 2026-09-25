import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../db/database';
import { asLocalDate } from '../domain/date';
import { GOAL_TEMPLATES } from '../domain/planner/templates';
import { createGoalWithPlan } from './planWriteRepo';
import { previewReplan, applyReplan } from './replanRepo';
import { listActivitiesForGoal } from './activityRepo';
import { getWeekPlan, editWeekTargets } from './weeklyPlanRepo';
import { listTasksForGoalRange, completeTask } from './taskRepo';
import { ensureWeekMaterialized } from './planWriteRepo';

beforeEach(async () => {
  const db = getDb();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});

describe('previewReplan / applyReplan — real re-planning through the repo layer', () => {
  it('redistributes remaining work across future weeks and regenerates only pending tasks', async () => {
    const template = GOAL_TEMPLATES.weightChange!;
    const startDate = asLocalDate('2026-09-14'); // a Monday
    const goalId = await createGoalWithPlan(
      {
        name: 'Fitness',
        type: 'metric',
        startDate,
        deadline: { precision: 'day', value: asLocalDate('2026-10-26') }, // 7 week-starts inclusive
        color: 'teal',
        config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
        activities: template.activities,
        milestones: template.milestones,
      },
      1,
    );

    const activities = await listActivitiesForGoal(goalId);
    const workout = activities.find((a) => a.name === 'Workout')!;

    // Complete one task in week 1 (the only thing "done" before we jump ahead).
    const week1Tasks = await listTasksForGoalRange(goalId, startDate, asLocalDate('2026-09-20'));
    await completeTask(week1Tasks[0]!.id);

    const today = asLocalDate('2026-10-05'); // now in week 4 of 7
    const diff = await previewReplan(goalId, today, 1);

    expect(diff.weeks.some((w) => w.kind === 'frozen')).toBe(true);
    const created = diff.weeks.filter((w) => w.kind === 'created' || w.kind === 'replaced');
    expect(created.length).toBeGreaterThan(0);

    await applyReplan(goalId, diff, 1);

    const currentWeekPlan = await getWeekPlan(goalId, today);
    expect(currentWeekPlan?.source).toBe('replanned');
    const workoutTarget = currentWeekPlan?.targets.find((t) => t.activityId === workout.id);
    // Original flat rate was 3/week; falling behind should push this week's target up.
    expect(workoutTarget?.amount).toBeGreaterThan(3);

    // Generated TASKS are still capped at the activity's fixed schedule (3 preferred
    // days/week) — a redistributed target may honestly exceed that (spec: never
    // silently truncate the NUMBER), but task placement can't invent extra weekdays.
    const currentWeekTasks = await listTasksForGoalRange(goalId, today, asLocalDate('2026-10-11'));
    expect(currentWeekTasks.length).toBe(3);
    expect(workoutTarget?.amount).toBeGreaterThan(currentWeekTasks.length);
  });

  it('preserves a user-edited week verbatim through a re-plan', async () => {
    const template = GOAL_TEMPLATES.weightChange!;
    const startDate = asLocalDate('2026-09-14');
    const goalId = await createGoalWithPlan(
      {
        name: 'Fitness',
        type: 'metric',
        startDate,
        deadline: { precision: 'day', value: asLocalDate('2026-10-26') },
        color: 'teal',
        config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
        activities: template.activities,
        milestones: template.milestones,
      },
      1,
    );
    const activities = await listActivitiesForGoal(goalId);
    const workout = activities.find((a) => a.name === 'Workout')!;

    const today = asLocalDate('2026-10-05');
    const futureWeekStart = asLocalDate('2026-10-12');
    // Future weeks materialize lazily (PLANNING-ENGINE.md §9) — only week 1 exists
    // right after creation, so this one must be explicitly materialized first.
    await ensureWeekMaterialized(goalId, futureWeekStart, 1);
    const futurePlan = await getWeekPlan(goalId, futureWeekStart);
    expect(futurePlan).not.toBeNull();
    await editWeekTargets(futurePlan!.id, [{ activityId: workout.id, aggregate: 'count', amount: 7, band: null }]);

    const diff = await previewReplan(goalId, today, 1);
    const keptWeek = diff.weeks.find((w) => w.weekStart === futureWeekStart);
    expect(keptWeek?.kind).toBe('kept');
    expect(keptWeek?.targets.find((t) => t.activityId === workout.id)?.amount).toBe(7);

    await applyReplan(goalId, diff, 1);
    const afterApply = await getWeekPlan(goalId, futureWeekStart);
    expect(afterApply?.source).toBe('edited'); // untouched — applyReplan skips 'kept' weeks entirely
    expect(afterApply?.targets.find((t) => t.activityId === workout.id)?.amount).toBe(7);
  });
});
