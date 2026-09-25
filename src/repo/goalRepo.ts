import { getDb } from '../db/database';
import { newId } from '../domain/ids';
import type { Goal, GoalId, GoalStatus, GoalSubtree, LocalDate, TrashEntry } from '../domain/types';

const TRASH_RETENTION_MS = 30 * 24 * 3_600_000;

export async function listActiveGoals(): Promise<Goal[]> {
  const db = getDb();
  return db.goals.where('status').equals('active').sortBy('sortOrder');
}

export async function listGoalsByStatus(status: GoalStatus): Promise<Goal[]> {
  const db = getDb();
  return db.goals.where('status').equals(status).sortBy('sortOrder');
}

export async function getGoal(id: GoalId): Promise<Goal | null> {
  const db = getDb();
  return (await db.goals.get(id)) ?? null;
}

export async function updateGoal(id: GoalId, patch: Partial<Omit<Goal, 'id' | 'createdAt'>>): Promise<void> {
  const db = getDb();
  const existing = await db.goals.get(id);
  if (!existing) throw new Error(`Goal not found: ${id}`);
  await db.goals.put({ ...existing, ...patch, updatedAt: Date.now() } as Goal);
}

export async function setGoalStatus(id: GoalId, status: GoalStatus): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const existing = await db.goals.get(id);
  if (!existing) throw new Error(`Goal not found: ${id}`);
  const patch: Partial<Goal> = { status, updatedAt: now };
  if (status === 'completed') patch.completedAt = now;
  if (status === 'archived') patch.archivedAt = now;
  await db.goals.put({ ...existing, ...patch } as Goal);
}

/** Adds a new pause interval, or is a no-op if one is already open (idempotent). */
export async function pauseGoal(id: GoalId, from: LocalDate, now = Date.now()): Promise<void> {
  const db = getDb();
  const existing = await db.goals.get(id);
  if (!existing) throw new Error(`Goal not found: ${id}`);
  const alreadyOpen = existing.pauses.some((p) => p.to === null);
  if (alreadyOpen) return;
  const pauses = [...existing.pauses, { from, to: null }];
  await db.goals.put({ ...existing, status: 'paused', pauses, updatedAt: now } as Goal);
  // Delete pending future tasks for this goal from `from` onward (EDGE-CASES.md EC-L05).
  await db.tasks.where('goalId').equals(id).filter((t) => t.status === 'pending' && t.date >= from).delete();
}

export async function resumeGoal(id: GoalId, resumeDate: LocalDate, now = Date.now()): Promise<void> {
  const db = getDb();
  const existing = await db.goals.get(id);
  if (!existing) throw new Error(`Goal not found: ${id}`);
  const pauses = existing.pauses.map((p, i) => (i === existing.pauses.length - 1 && p.to === null ? { ...p, to: resumeDate } : p));
  await db.goals.put({ ...existing, status: 'active', pauses, updatedAt: now } as Goal);
}

/**
 * Hard cascading delete, with a 30-day trash entry (DATA-MODEL.md §6.3). Each
 * deletion gets its OWN row, so deleting goal B never destroys goal A's undo.
 */
export async function deleteGoalCascade(goalId: GoalId): Promise<TrashEntry> {
  const db = getDb();
  return db.transaction('rw', [db.goals, db.activities, db.milestones, db.weeklyPlans, db.tasks, db.entries, db.trash], async () => {
    const goal = await db.goals.get(goalId);
    if (!goal) throw new Error(`Goal not found: ${goalId}`);
    const snapshot: GoalSubtree = {
      goal,
      activities: await db.activities.where('goalId').equals(goalId).toArray(),
      milestones: await db.milestones.where('goalId').equals(goalId).toArray(),
      weeklyPlans: await db.weeklyPlans.where('goalId').equals(goalId).toArray(),
      tasks: await db.tasks.where('goalId').equals(goalId).toArray(),
      entries: await db.entries.where('goalId').equals(goalId).toArray(),
    };
    await db.entries.where('goalId').equals(goalId).delete();
    await db.tasks.where('goalId').equals(goalId).delete();
    await db.weeklyPlans.where('goalId').equals(goalId).delete();
    await db.milestones.where('goalId').equals(goalId).delete();
    await db.activities.where('goalId').equals(goalId).delete();
    await db.goals.delete(goalId);
    const now = Date.now();
    const trashEntry: TrashEntry = { id: newId(), goalName: snapshot.goal.name, deletedAt: now, expiresAt: now + TRASH_RETENTION_MS, payload: snapshot };
    await db.trash.add(trashEntry);
    return trashEntry;
  });
}

export async function listTrash(): Promise<TrashEntry[]> {
  const db = getDb();
  return db.trash.orderBy('deletedAt').reverse().toArray();
}

/** Restores one trash entry by its OWN id (not the goal's id). */
export async function undoGoalDelete(trashId: string): Promise<GoalId | null> {
  const db = getDb();
  return db.transaction('rw', [db.goals, db.activities, db.milestones, db.weeklyPlans, db.tasks, db.entries, db.trash], async () => {
    const entry = await db.trash.get(trashId);
    if (!entry) return null;
    const { goal, activities, milestones, weeklyPlans, tasks, entries } = entry.payload;
    await db.goals.add(goal);
    if (activities.length) await db.activities.bulkAdd(activities);
    if (milestones.length) await db.milestones.bulkAdd(milestones);
    if (weeklyPlans.length) await db.weeklyPlans.bulkAdd(weeklyPlans);
    if (tasks.length) await db.tasks.bulkAdd(tasks);
    if (entries.length) await db.entries.bulkAdd(entries);
    await db.trash.delete(trashId);
    return goal.id;
  });
}

/** Runs at boot. Deletes every trash row past its expiresAt. */
export async function purgeExpiredTrash(now = Date.now()): Promise<number> {
  const db = getDb();
  return db.trash.where('expiresAt').below(now).delete();
}
