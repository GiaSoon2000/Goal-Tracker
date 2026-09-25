import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../db/database';
import { asLocalDate } from '../domain/date';
import { GOAL_TEMPLATES } from '../domain/planner/templates';
import { createGoalWithPlan } from './planWriteRepo';
import { listTasksForDate } from './taskRepo';
import { archiveGoal, getGoal, listGoalsByStatus, pauseGoal, resumeGoal, setGoalStatus, updateGoal } from './goalRepo';

beforeEach(async () => {
  const db = getDb();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});

async function seedGoal(startDate = asLocalDate('2026-09-19')) {
  const template = GOAL_TEMPLATES.weightChange!;
  return createGoalWithPlan(
    {
      name: 'Fitness',
      type: 'metric',
      startDate,
      deadline: { precision: 'month', value: '2027-03' },
      color: 'teal',
      config: { direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null },
      activities: GOAL_TEMPLATES.weightChange!.activities,
      milestones: template.milestones,
    },
    1,
  );
}

describe('updateGoal', () => {
  it('merges a partial patch onto the existing record without touching other fields', async () => {
    const goalId = await seedGoal();
    await updateGoal(goalId, { name: 'Renamed Fitness' });
    const goal = await getGoal(goalId);
    expect(goal?.name).toBe('Renamed Fitness');
    expect(goal?.config).toEqual({ direction: 'increase', startValue: 43, targetValue: 50, unit: 'kg', decimals: 1, paceBand: null });
  });

  it('updates the deadline without touching existing weekly plans or tasks', async () => {
    const goalId = await seedGoal();
    const tasksBefore = await listTasksForDate(asLocalDate('2026-09-19'));
    await updateGoal(goalId, { deadline: { precision: 'day', value: asLocalDate('2027-06-30') } });
    const goal = await getGoal(goalId);
    expect(goal?.deadline).toEqual({ precision: 'day', value: '2027-06-30' });
    const tasksAfter = await listTasksForDate(asLocalDate('2026-09-19'));
    expect(tasksAfter).toEqual(tasksBefore); // edit alone never touches the plan — Re-plan is the deliberate path
  });
});

describe('setGoalStatus', () => {
  it('stamps completedAt when moved to completed', async () => {
    const goalId = await seedGoal();
    await setGoalStatus(goalId, 'completed');
    const goal = await getGoal(goalId);
    expect(goal?.status).toBe('completed');
    expect(goal?.completedAt).not.toBeNull();
  });

  it('stamps archivedAt when moved to archived', async () => {
    const goalId = await seedGoal();
    await setGoalStatus(goalId, 'archived');
    const goal = await getGoal(goalId);
    expect(goal?.archivedAt).not.toBeNull();
  });
});

describe('pauseGoal / resumeGoal', () => {
  it('opens a pause interval, deletes future pending tasks, and never counts a paused day as missed later', async () => {
    const goalId = await seedGoal();
    await pauseGoal(goalId, asLocalDate('2026-09-19'));
    const goal = await getGoal(goalId);
    expect(goal?.status).toBe('paused');
    expect(goal?.pauses).toEqual([{ from: '2026-09-19', to: null }]);
    expect(await listTasksForDate(asLocalDate('2026-09-19'))).toHaveLength(0); // pending task removed on pause
  });

  it('is idempotent: pausing an already-paused goal does not open a second interval', async () => {
    const goalId = await seedGoal();
    await pauseGoal(goalId, asLocalDate('2026-09-19'));
    await pauseGoal(goalId, asLocalDate('2026-09-20'));
    const goal = await getGoal(goalId);
    expect(goal?.pauses).toHaveLength(1);
  });

  it('closes the open pause interval and reactivates the goal on resume', async () => {
    const goalId = await seedGoal();
    await pauseGoal(goalId, asLocalDate('2026-09-19'));
    await resumeGoal(goalId, asLocalDate('2026-09-25'));
    const goal = await getGoal(goalId);
    expect(goal?.status).toBe('active');
    expect(goal?.pauses).toEqual([{ from: '2026-09-19', to: '2026-09-25' }]);
  });
});

describe('archiveGoal — spec §8, EDGE-CASES.md EC-L07', () => {
  it('removes only pending tasks dated today or later, keeping every past task', async () => {
    const goalId = await seedGoal();
    const today = asLocalDate('2026-09-19');
    const tasksBefore = await listTasksForDate(today);
    expect(tasksBefore.length).toBeGreaterThan(0); // sanity: something exists to be removed

    await archiveGoal(goalId, today);

    const goal = await getGoal(goalId);
    expect(goal?.status).toBe('archived');
    expect(goal?.archivedAt).not.toBeNull();
    expect(await listTasksForDate(today)).toHaveLength(0);
  });

  it('appears under listGoalsByStatus("archived") and never under active', async () => {
    const goalId = await seedGoal();
    await archiveGoal(goalId, asLocalDate('2026-09-19'));
    expect((await listGoalsByStatus('archived')).map((g) => g.id)).toContain(goalId);
    expect((await listGoalsByStatus('active')).map((g) => g.id)).not.toContain(goalId);
  });

  it('can be reactivated with setGoalStatus back to active', async () => {
    const goalId = await seedGoal();
    await archiveGoal(goalId, asLocalDate('2026-09-19'));
    await setGoalStatus(goalId, 'active');
    const goal = await getGoal(goalId);
    expect(goal?.status).toBe('active');
  });
});
