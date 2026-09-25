import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../db/database';
import { asLocalDate } from '../domain/date';
import { GOAL_TEMPLATES } from '../domain/planner/templates';
import { completeTask, listTasksForDate, uncompleteTask } from './taskRepo';
import { entriesForActivity } from './entryRepo';
import { listActivitiesForGoal } from './activityRepo';
import { listMilestonesForGoal } from './milestoneRepo';
import { deleteGoalCascade, getGoal, listActiveGoals, listTrash, undoGoalDelete } from './goalRepo';
import { createGoalWithPlan } from './planWriteRepo';
import { getWeekPlan } from './weeklyPlanRepo';
import type { GoalId } from '../domain/types';

beforeEach(async () => {
  const db = getDb();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});

describe('createGoalWithPlan — the full backward-planning pipeline, end to end', () => {
  it('creates a Fitness goal and materializes week 1 with generated tasks (spec §7 worked example)', async () => {
    const template = GOAL_TEMPLATES.weightChange!;
    const startDate = asLocalDate('2026-09-19'); // a Saturday

    const goalId = await createGoalWithPlan(
      {
        name: 'Fitness',
        type: 'metric',
        startDate,
        deadline: { precision: 'month', value: '2027-03' },
        color: 'teal',
        config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
        activities: template.activities,
        milestones: template.milestones,
      },
      1,
    );

    const goal = await getGoal(goalId);
    expect(goal?.name).toBe('Fitness');
    expect(goal?.status).toBe('active');

    const activities = await listActivitiesForGoal(goalId);
    expect(activities.map((a) => a.name).sort()).toEqual(['Weight', 'Workout']);

    const weekStart = asLocalDate('2026-09-14'); // the Monday containing startDate
    const plan = await getWeekPlan(goalId, weekStart);
    expect(plan).not.toBeNull();
    expect(plan!.source).toBe('generated');

    // Workout: preferredDays [1,3,5] (Tue/Thu/Sat); only Sat (the 19th) is >= startDate this week.
    const workout = activities.find((a) => a.name === 'Workout')!;
    const workoutTarget = plan!.targets.find((t) => t.activityId === workout.id);
    expect(workoutTarget?.amount).toBe(1); // prorated first week (EC-T08)

    const tasksToday = await listTasksForDate(startDate);
    expect(tasksToday).toHaveLength(1);
    expect(tasksToday[0]!.title).toBe('Workout');
    expect(tasksToday[0]!.status).toBe('pending');

    // Weight activity has scheduling.mode: 'none' — it never generates a task, only direct logging.
    expect(tasksToday.some((t) => t.title === 'Weight')).toBe(false);
  });

  it('has no milestones for the weightChange template (a metric goal tracks a trajectory, not checkpoints)', async () => {
    const template = GOAL_TEMPLATES.weightChange!;
    const goalId = await createGoalWithPlan(
      {
        name: 'Fitness',
        type: 'metric',
        startDate: asLocalDate('2026-09-19'),
        deadline: { precision: 'month', value: '2027-03' },
        color: 'teal',
        config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
        activities: template.activities,
        milestones: template.milestones,
      },
      1,
    );
    expect(await listMilestonesForGoal(goalId)).toHaveLength(0);
  });

  it('scaffolds and spreads milestones for a Piano skill goal', async () => {
    const template = GOAL_TEMPLATES.pianoBeginner!;
    const goalId = await createGoalWithPlan(
      {
        name: 'Piano',
        type: 'skill',
        startDate: asLocalDate('2026-09-19'),
        deadline: { precision: 'month', value: '2027-06' },
        color: 'violet',
        config: { currentLevel: 'Beginner', targetOutcome: 'Play 5 songs', levelScale: null },
        activities: template.activities,
        milestones: template.milestones,
      },
      1,
    );
    const milestones = await listMilestonesForGoal(goalId);
    expect(milestones).toHaveLength(5);
    expect(milestones[0]!.title).toBe('Posture & hand position');
    expect(milestones[4]!.targetDate).toBe('2027-06-30'); // resolveDeadline of month-precision '2027-06'
  });
});

describe('completeTask / uncompleteTask — atomic task <-> entry linkage (DATA-MODEL.md §4.5)', () => {
  it('writes a linked entry on completion and removes it exactly on un-completion', async () => {
    const template = GOAL_TEMPLATES.weightChange!;
    const goalId = await createGoalWithPlan(
      {
        name: 'Fitness',
        type: 'metric',
        startDate: asLocalDate('2026-09-19'),
        deadline: { precision: 'month', value: '2027-03' },
        color: 'teal',
        config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
        activities: template.activities,
        milestones: template.milestones,
      },
      1,
    );
    const activities = await listActivitiesForGoal(goalId);
    const workout = activities.find((a) => a.name === 'Workout')!;
    const tasks = await listTasksForDate(asLocalDate('2026-09-19'));
    const task = tasks[0]!;

    await completeTask(task.id);
    const afterComplete = (await listTasksForDate(asLocalDate('2026-09-19')))[0]!;
    expect(afterComplete.status).toBe('done');
    expect(afterComplete.entryId).not.toBeNull();

    const entries = await entriesForActivity(workout.id, asLocalDate('2026-09-01'), asLocalDate('2026-09-30'));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.source).toBe('task');

    // Idempotent: completing an already-done task is a no-op.
    await completeTask(task.id);
    expect(await entriesForActivity(workout.id, asLocalDate('2026-09-01'), asLocalDate('2026-09-30'))).toHaveLength(1);

    await uncompleteTask(task.id);
    const afterUncomplete = (await listTasksForDate(asLocalDate('2026-09-19')))[0]!;
    expect(afterUncomplete.status).toBe('pending');
    expect(afterUncomplete.entryId).toBeNull();
    expect(await entriesForActivity(workout.id, asLocalDate('2026-09-01'), asLocalDate('2026-09-30'))).toHaveLength(0);
  });
});

describe('deleteGoalCascade / undoGoalDelete — recoverable delete (DATA-MODEL.md §6.3)', () => {
  it('removes the goal and everything under it, then fully restores it via trash', async () => {
    const template = GOAL_TEMPLATES.weightChange!;
    const goalId = await createGoalWithPlan(
      {
        name: 'Fitness',
        type: 'metric',
        startDate: asLocalDate('2026-09-19'),
        deadline: { precision: 'month', value: '2027-03' },
        color: 'teal',
        config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
        activities: template.activities,
        milestones: template.milestones,
      },
      1,
    );

    expect(await listActiveGoals()).toHaveLength(1);
    const trashEntry = await deleteGoalCascade(goalId);
    expect(await listActiveGoals()).toHaveLength(0);
    expect(await listActivitiesForGoal(goalId)).toHaveLength(0);
    expect(await getGoal(goalId)).toBeNull();

    const trash = await listTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0]!.goalName).toBe('Fitness');

    const restoredId = await undoGoalDelete(trashEntry.id);
    expect(restoredId).toBe(goalId);
    expect(await listActiveGoals()).toHaveLength(1);
    expect(await listActivitiesForGoal(goalId)).toHaveLength(2);
    expect(await listTrash()).toHaveLength(0);
  });

  it('deleting a second goal does not destroy the first goal\'s undo (the single-slot bug this design fixes)', async () => {
    const template = GOAL_TEMPLATES.weightChange!;
    async function makeGoal(name: string): Promise<GoalId> {
      return createGoalWithPlan(
        {
          name,
          type: 'metric',
          startDate: asLocalDate('2026-09-19'),
          deadline: { precision: 'month', value: '2027-03' },
          color: 'teal',
          config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
          activities: template.activities,
          milestones: template.milestones,
        },
        1,
      );
    }
    const goalA = await makeGoal('Goal A');
    const goalB = await makeGoal('Goal B');
    const trashA = await deleteGoalCascade(goalA);
    await deleteGoalCascade(goalB);

    expect(await listTrash()).toHaveLength(2);
    const restored = await undoGoalDelete(trashA.id);
    expect(restored).toBe(goalA);
  });
});
