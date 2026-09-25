import Dexie from 'dexie';
import { getDb } from '../db/database';
import { newId } from '../domain/ids';
import type { Activity, DailyTask, EntryId, GoalId, LocalDate, TaskId, TrackEntry } from '../domain/types';

export async function listTasksForDate(date: LocalDate): Promise<DailyTask[]> {
  const db = getDb();
  return db.tasks.where('[date+sortOrder]').between([date, Dexie.minKey], [date, Dexie.maxKey]).sortBy('sortOrder');
}

export async function listTasksForGoalRange(goalId: GoalId, from: LocalDate, to: LocalDate): Promise<DailyTask[]> {
  const db = getDb();
  return db.tasks.where('[goalId+date]').between([goalId, from], [goalId, to], true, true).toArray();
}

export async function listTasksForRange(from: LocalDate, to: LocalDate): Promise<DailyTask[]> {
  const db = getDb();
  return db.tasks.where('date').between(from, to, true, true).toArray();
}

function entryFieldsForActivity(activity: Activity, plannedMinutes: number | null): Pick<TrackEntry, 'kind' | 'value'> {
  switch (activity.kind) {
    case 'habit':
      return { kind: 'habit', value: { done: true } };
    case 'session':
      return { kind: 'session', value: { count: 1, minutes: plannedMinutes, intensity: null } };
    case 'duration': {
      const minutes = plannedMinutes ?? 0;
      return { kind: 'duration', value: { minutes, entryValue: minutes, entryUnit: 'min' } };
    }
    case 'metric':
      // Metric-kind activities always have scheduling.mode:'none' (never generate tasks);
      // a metric task completion is not a supported path — logged directly instead.
      throw new Error('Cannot complete a task for a metric-kind activity');
  }
}

/**
 * Idempotent: completing an already-done task is a no-op (no updatedAt bump, no
 * duplicate entry). Writes the task and its linked entry in one transaction.
 */
export async function completeTask(id: TaskId): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.tasks, db.entries, db.activities], async () => {
    const task = await db.tasks.get(id);
    if (!task || task.status === 'done') return;
    const now = Date.now();
    let entryId: EntryId | null = null;
    if (task.activityId) {
      const activity = await db.activities.get(task.activityId);
      if (activity) {
        entryId = newId<EntryId>();
        const fields = entryFieldsForActivity(activity, task.plannedMinutes);
        await db.entries.add({
          id: entryId,
          goalId: task.goalId,
          activityId: task.activityId,
          date: task.date,
          loggedAt: now,
          taskId: task.id,
          source: 'task',
          createdAt: now,
          updatedAt: now,
          ...fields,
        } as TrackEntry);
      }
    }
    await db.tasks.put({ ...task, status: 'done', completedAt: now, entryId, updatedAt: now });
  });
}

/** Reverses completeTask exactly: deletes the linked entry, returns the task to pending. */
export async function uncompleteTask(id: TaskId): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.tasks, db.entries], async () => {
    const task = await db.tasks.get(id);
    if (!task || task.status !== 'done') return;
    if (task.entryId) await db.entries.delete(task.entryId);
    await db.tasks.put({ ...task, status: 'pending', completedAt: null, entryId: null, updatedAt: Date.now() });
  });
}

/** A deliberate re-plan decision, never worded as failure (spec §5/§11). No entry is written. */
export async function skipTask(id: TaskId): Promise<void> {
  const db = getDb();
  const task = await db.tasks.get(id);
  if (!task) return;
  await db.tasks.put({ ...task, status: 'skipped', updatedAt: Date.now() });
}

export async function rescheduleTask(id: TaskId, to: LocalDate): Promise<void> {
  const db = getDb();
  const task = await db.tasks.get(id);
  if (!task) return;
  await db.tasks.put({ ...task, date: to, originalDate: task.originalDate ?? task.date, updatedAt: Date.now() });
}

export async function toggleStep(taskId: TaskId, stepId: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.tasks, db.entries, db.activities], async () => {
    const task = await db.tasks.get(taskId);
    if (!task) return;
    const steps = task.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    const allDone = steps.length > 0 && steps.every((s) => s.done);
    await db.tasks.put({ ...task, steps, updatedAt: Date.now() });
    if (allDone && task.status !== 'done') {
      await completeTask(taskId);
    } else if (!allDone && task.status === 'done') {
      await uncompleteTask(taskId);
    }
  });
}
