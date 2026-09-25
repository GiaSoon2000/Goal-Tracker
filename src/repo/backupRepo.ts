import { getDb, SCHEMA_VERSION } from '../db/database';
import { todayLocal } from '../domain/date';
import type { ExportDoc } from '../domain/types';

/** Consistent point-in-time read: one readonly transaction across every table. */
export async function exportSnapshot(): Promise<ExportDoc> {
  const db = getDb();
  return db.transaction('r', [db.settings, db.goals, db.activities, db.milestones, db.weeklyPlans, db.tasks, db.entries], async () => {
    const [settings, goals, activities, milestones, weeklyPlans, tasks, entries] = await Promise.all([
      db.settings.get('singleton'),
      db.goals.toArray(),
      db.activities.toArray(),
      db.milestones.toArray(),
      db.weeklyPlans.toArray(),
      db.tasks.toArray(),
      db.entries.toArray(),
    ]);
    if (!settings) throw new Error('Settings row missing — cannot export');
    return {
      format: 'goal-backward-planner',
      schemaVersion: SCHEMA_VERSION,
      // Metadata only — never used for date math (EDGE-CASES.md EC-T14), so a full
      // ISO instant is fine here even though it's outside domain/date.ts's civil-date API.
      // eslint-disable-next-line no-restricted-syntax
      exportedAt: new Date().toISOString(),
      appVersion: '0.1.0',
      counts: { settings: 1, goals: goals.length, activities: activities.length, milestones: milestones.length, weeklyPlans: weeklyPlans.length, tasks: tasks.length, entries: entries.length },
      data: { settings, goals, activities, milestones, weeklyPlans, tasks, entries },
    };
  });
}

/** Blob + <a download> — works everywhere including iOS Safari standalone; no File System Access API. */
export async function exportBackupFile(): Promise<void> {
  const doc = await exportSnapshot();
  const json = JSON.stringify(doc, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `goal-planner-backup-${todayLocal()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportSummary {
  goals: number;
  activities: number;
  milestones: number;
  weeklyPlans: number;
  tasks: number;
  entries: number;
}

export type ImportValidation = { ok: true; doc: ExportDoc; summary: ImportSummary } | { ok: false; error: string };

/** Validates BEFORE touching any existing data (spec §15) — pure, no DB access. */
export function validateImportDoc(raw: unknown): ImportValidation {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Not a valid JSON object.' };
  const doc = raw as Partial<ExportDoc>;
  if (doc.format !== 'goal-backward-planner') return { ok: false, error: "This file wasn't created by Goal Planner." };
  if (typeof doc.schemaVersion !== 'number') return { ok: false, error: 'Missing schema version.' };
  if (doc.schemaVersion > SCHEMA_VERSION) return { ok: false, error: 'This backup was made by a newer version of the app. Update the app, then import.' };
  if (!doc.data || typeof doc.data !== 'object') return { ok: false, error: 'Missing data payload.' };
  const d = doc.data;
  if (!Array.isArray(d.goals) || !Array.isArray(d.activities) || !Array.isArray(d.milestones) || !Array.isArray(d.weeklyPlans) || !Array.isArray(d.tasks) || !Array.isArray(d.entries)) {
    return { ok: false, error: 'Data payload is malformed.' };
  }
  return {
    ok: true,
    doc: doc as ExportDoc,
    summary: { goals: d.goals.length, activities: d.activities.length, milestones: d.milestones.length, weeklyPlans: d.weeklyPlans.length, tasks: d.tasks.length, entries: d.entries.length },
  };
}

/**
 * The DB mutation only — no browser side effects, so this is fully testable in
 * Node. `'replace'` clears and writes in ONE transaction: a failed import leaves
 * the database byte-identical. Callers MUST trigger `exportBackupFile()` first
 * for `'replace'` (see `applyImportWithSafetyExport` below) — spec §15's forced
 * safety net before the one destructive operation in the app.
 */
export async function applyImport(doc: ExportDoc, mode: 'replace' | 'merge'): Promise<{ inserted: number; updated: number }> {
  const db = getDb();
  return db.transaction('rw', [db.settings, db.goals, db.activities, db.milestones, db.weeklyPlans, db.tasks, db.entries], async () => {
    if (mode === 'replace') {
      await Promise.all([db.goals.clear(), db.activities.clear(), db.milestones.clear(), db.weeklyPlans.clear(), db.tasks.clear(), db.entries.clear()]);
      await db.settings.put(doc.data.settings);
      await db.goals.bulkAdd(doc.data.goals);
      await db.activities.bulkAdd(doc.data.activities);
      await db.milestones.bulkAdd(doc.data.milestones);
      await db.weeklyPlans.bulkAdd(doc.data.weeklyPlans);
      await db.tasks.bulkAdd(doc.data.tasks);
      await db.entries.bulkAdd(doc.data.entries);
      const total = doc.data.goals.length + doc.data.activities.length + doc.data.milestones.length + doc.data.weeklyPlans.length + doc.data.tasks.length + doc.data.entries.length;
      return { inserted: total, updated: 0 };
    }

    // 'merge': id-preserving upsert, last-write-wins by updatedAt.
    let inserted = 0;
    let updated = 0;
    const tables = [
      [db.goals, doc.data.goals] as const,
      [db.activities, doc.data.activities] as const,
      [db.milestones, doc.data.milestones] as const,
      [db.weeklyPlans, doc.data.weeklyPlans] as const,
      [db.tasks, doc.data.tasks] as const,
      [db.entries, doc.data.entries] as const,
    ];
    for (const [table, rows] of tables) {
      for (const row of rows) {
        const existing = await table.get(row.id);
        if (!existing) {
          await table.add(row as never);
          inserted++;
        } else if (row.updatedAt >= existing.updatedAt) {
          await table.put(row as never);
          updated++;
        }
      }
    }
    return { inserted, updated };
  });
}

/**
 * UI-facing entry point: for `'replace'`, downloads a safety backup of the
 * CURRENT data first (a real file, must succeed) before wiping anything — a
 * single confirm dialog cannot be trusted with a user's only copy (spec §15).
 */
export async function applyImportWithSafetyExport(doc: ExportDoc, mode: 'replace' | 'merge'): Promise<{ inserted: number; updated: number }> {
  if (mode === 'replace') await exportBackupFile();
  return applyImport(doc, mode);
}
