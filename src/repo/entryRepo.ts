import { getDb } from '../db/database';
import { newId } from '../domain/ids';
import type { ActivityId, EntryId, GoalId, LocalDate, TaskId, TrackEntry, TrackValue } from '../domain/types';

export interface NewEntryInput {
  goalId: GoalId;
  activityId: ActivityId;
  kind: TrackEntry['kind'];
  value: TrackValue;
  date: LocalDate;
  note?: string;
  taskId?: TaskId | null;
  source?: TrackEntry['source'];
}

export async function logEntry(input: NewEntryInput): Promise<EntryId> {
  const db = getDb();
  const now = Date.now();
  const id = newId<EntryId>();
  const entry = {
    id,
    goalId: input.goalId,
    activityId: input.activityId,
    kind: input.kind,
    value: input.value,
    date: input.date,
    loggedAt: now,
    taskId: input.taskId ?? null,
    source: input.source ?? 'manual',
    createdAt: now,
    updatedAt: now,
    ...(input.note !== undefined ? { note: input.note } : {}),
  } as TrackEntry;
  await db.entries.add(entry);
  return id;
}

export async function editEntry(id: EntryId, patch: { date?: LocalDate; value?: TrackValue; note?: string }): Promise<void> {
  const db = getDb();
  const existing = await db.entries.get(id);
  if (!existing) throw new Error(`Entry not found: ${id}`);
  await db.entries.put({ ...existing, ...patch, updatedAt: Date.now() } as TrackEntry);
}

export async function deleteEntry(id: EntryId): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.entries, db.tasks], async () => {
    await db.entries.delete(id);
    // Clear the link on any task that pointed at this entry (un-complete cleanly).
    await db.tasks.where('entryId').equals(id).modify({ entryId: null, status: 'pending', completedAt: null });
  });
}

export async function entriesForWeek(goalId: GoalId, weekStart: LocalDate, weekEnd: LocalDate): Promise<TrackEntry[]> {
  const db = getDb();
  return db.entries.where('[goalId+date]').between([goalId, weekStart], [goalId, weekEnd], true, true).toArray();
}

export async function entriesForActivity(activityId: ActivityId, from: LocalDate, to: LocalDate): Promise<TrackEntry[]> {
  const db = getDb();
  return db.entries.where('[activityId+date]').between([activityId, from], [activityId, to], true, true).toArray();
}

export async function latestEntry(activityId: ActivityId): Promise<TrackEntry | null> {
  const db = getDb();
  const all = await db.entries.where('activityId').equals(activityId).toArray();
  if (all.length === 0) return null;
  return all.reduce((latest, e) => ((e.date === latest.date ? e.loggedAt > latest.loggedAt : e.date > latest.date) ? e : latest));
}
