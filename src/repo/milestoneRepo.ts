import { getDb } from '../db/database';
import type { GoalId, Milestone, MilestoneId, MilestoneStatus } from '../domain/types';

export async function listMilestonesForGoal(goalId: GoalId): Promise<Milestone[]> {
  const db = getDb();
  return db.milestones.where('goalId').equals(goalId).sortBy('order');
}

export async function setMilestoneStatus(id: MilestoneId, status: MilestoneStatus): Promise<void> {
  const db = getDb();
  const existing = await db.milestones.get(id);
  if (!existing) throw new Error(`Milestone not found: ${id}`);
  const now = Date.now();
  await db.milestones.put({ ...existing, status, completedAt: status === 'done' ? now : existing.completedAt, updatedAt: now });
}

export async function updateMilestone(id: MilestoneId, patch: Partial<Omit<Milestone, 'id' | 'goalId' | 'createdAt'>>): Promise<void> {
  const db = getDb();
  const existing = await db.milestones.get(id);
  if (!existing) throw new Error(`Milestone not found: ${id}`);
  await db.milestones.put({ ...existing, ...patch, updatedAt: Date.now() });
}

/** SET NULL on referencing tasks, not cascade — a user's completed history must survive. */
export async function deleteMilestone(id: MilestoneId, alsoDeletePendingTasks: boolean): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.milestones, db.tasks], async () => {
    if (alsoDeletePendingTasks) {
      await db.tasks.where('milestoneId').equals(id).filter((t) => t.status === 'pending').delete();
    }
    await db.tasks.where('milestoneId').equals(id).modify({ milestoneId: null });
    await db.milestones.delete(id);
  });
}
