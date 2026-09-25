import { getDb } from '../db/database';
import type { GoalId, LocalDate, WeeklyPlan, WeeklyTarget } from '../domain/types';

export async function getWeekPlan(goalId: GoalId, weekStart: LocalDate): Promise<WeeklyPlan | null> {
  const db = getDb();
  return (await db.weeklyPlans.where('[goalId+weekStart]').equals([goalId, weekStart]).first()) ?? null;
}

export async function listWeekPlansForGoal(goalId: GoalId): Promise<WeeklyPlan[]> {
  const db = getDb();
  return db.weeklyPlans.where('goalId').equals(goalId).sortBy('weekStart');
}

export async function listAllWeekPlans(): Promise<WeeklyPlan[]> {
  const db = getDb();
  return db.weeklyPlans.orderBy('weekStart').toArray();
}

export async function listWeekPlansInRange(from: LocalDate, to: LocalDate): Promise<WeeklyPlan[]> {
  const db = getDb();
  return db.weeklyPlans.where('weekStart').between(from, to, true, true).toArray();
}

/**
 * Idempotent upsert keyed by the unique (goalId, weekStart) index — two tabs
 * materializing the same week concurrently cannot create a duplicate row.
 */
export async function upsertWeekPlan(plan: WeeklyPlan): Promise<void> {
  const db = getDb();
  const existing = await getWeekPlan(plan.goalId, plan.weekStart);
  if (existing) {
    await db.weeklyPlans.put({ ...plan, id: existing.id, createdAt: existing.createdAt, updatedAt: Date.now() });
  } else {
    await db.weeklyPlans.add(plan);
  }
}

/** Manual edit: marks the week `source: 'edited'` so re-planning treats it as user-owned. */
export async function editWeekTargets(id: WeeklyPlan['id'], targets: WeeklyTarget[]): Promise<void> {
  const db = getDb();
  const existing = await db.weeklyPlans.get(id);
  if (!existing) throw new Error(`WeeklyPlan not found: ${id}`);
  await db.weeklyPlans.put({ ...existing, targets, source: 'edited', updatedAt: Date.now() });
}

export async function resetWeekToGenerated(id: WeeklyPlan['id'], targets: WeeklyTarget[]): Promise<void> {
  const db = getDb();
  const existing = await db.weeklyPlans.get(id);
  if (!existing) throw new Error(`WeeklyPlan not found: ${id}`);
  await db.weeklyPlans.put({ ...existing, targets, source: 'generated', updatedAt: Date.now() });
}
