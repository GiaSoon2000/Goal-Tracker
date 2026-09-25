import { getDb } from '../db/database';
import type { Activity, ActivityId, GoalId } from '../domain/types';

export async function listActivitiesForGoal(goalId: GoalId): Promise<Activity[]> {
  const db = getDb();
  return db.activities.where('goalId').equals(goalId).sortBy('sortOrder');
}

export async function listActivitiesForGoals(goalIds: GoalId[]): Promise<Activity[]> {
  const db = getDb();
  if (goalIds.length === 0) return [];
  return db.activities.where('goalId').anyOf(goalIds).toArray();
}

export async function getActivity(id: ActivityId): Promise<Activity | null> {
  const db = getDb();
  return (await db.activities.get(id)) ?? null;
}

export async function updateActivity(id: ActivityId, patch: Partial<Omit<Activity, 'id' | 'goalId' | 'createdAt'>>): Promise<void> {
  const db = getDb();
  const existing = await db.activities.get(id);
  if (!existing) throw new Error(`Activity not found: ${id}`);
  await db.activities.put({ ...existing, ...patch, updatedAt: Date.now() });
}

/**
 * An activity with logged history is archived, never hard-deleted — destroying a
 * user's weigh-in history because they renamed their routine would be unforgivable.
 * Only a zero-entry activity is hard-deleted.
 */
export async function retireOrDeleteActivity(id: ActivityId): Promise<'archived' | 'deleted'> {
  const db = getDb();
  const hasEntries = (await db.entries.where('activityId').equals(id).count()) > 0;
  if (hasEntries) {
    await updateActivity(id, { archived: true });
    return 'archived';
  }
  await db.activities.delete(id);
  return 'deleted';
}
