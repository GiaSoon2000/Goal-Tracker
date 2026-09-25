import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../db/database';
import { asLocalDate } from '../domain/date';
import { GOAL_TEMPLATES } from '../domain/planner/templates';
import { createGoalWithPlan } from './planWriteRepo';
import { listActiveGoals } from './goalRepo';
import { listActivitiesForGoal } from './activityRepo';
import { applyImport, applyImportWithSafetyExport, exportSnapshot, validateImportDoc } from './backupRepo';
import { ensureSettings } from './settingsRepo';

/** Minimal DOM stand-ins for exportBackupFile's <a download> mechanism — this
 *  project deliberately has no jsdom dependency (ARCHITECTURE.md §11.1), so the
 *  handful of calls it needs are stubbed directly rather than pulling one in. */
function stubMinimalDom(): { anchors: { href: string; download: string; clicked: boolean }[]; restore: () => void } {
  const anchors: { href: string; download: string; clicked: boolean }[] = [];
  const g = globalThis as Record<string, unknown>;
  const prevDocument = g.document;
  const prevCreateObjectURL = (globalThis.URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  const prevRevokeObjectURL = (globalThis.URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;

  g.document = {
    createElement: (tag: string) => {
      if (tag !== 'a') throw new Error(`unexpected createElement(${tag})`);
      const anchor = { href: '', download: '', clicked: false, click: function click(this: { clicked: boolean }) { this.clicked = true; } };
      anchors.push(anchor);
      return anchor;
    },
    body: { appendChild: () => undefined, removeChild: () => undefined },
  };
  (globalThis.URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:stub';
  (globalThis.URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;

  return {
    anchors,
    restore: () => {
      g.document = prevDocument;
      (globalThis.URL as unknown as { createObjectURL: unknown }).createObjectURL = prevCreateObjectURL;
      (globalThis.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = prevRevokeObjectURL;
    },
  };
}

beforeEach(async () => {
  const db = getDb();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await ensureSettings(); // exportSnapshot() requires the settings row to exist (normally done once at app boot)
});

async function seedGoal(name: string) {
  const template = GOAL_TEMPLATES.weightChange!;
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

describe('exportSnapshot / validateImportDoc / applyImport — spec §15 "critical feature"', () => {
  it('export -> import(replace) round-trips to an identical goal set', async () => {
    await seedGoal('Fitness');
    const exported = await exportSnapshot();

    const db = getDb();
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    expect(await listActiveGoals()).toHaveLength(0);

    const validation = validateImportDoc(exported);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    await applyImport(validation.doc, 'replace');

    const goals = await listActiveGoals();
    expect(goals).toHaveLength(1);
    expect(goals[0]!.name).toBe('Fitness');
    const reExported = await exportSnapshot();
    expect(reExported.data.goals).toEqual(exported.data.goals);
    expect(reExported.data.activities).toEqual(exported.data.activities);
  });

  it('rejects a file not created by this app', () => {
    const result = validateImportDoc({ format: 'something-else', schemaVersion: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects malformed JSON payloads without touching existing data', async () => {
    await seedGoal('Fitness');
    const before = await listActiveGoals();
    const result = validateImportDoc({ format: 'goal-backward-planner', schemaVersion: 1, data: { goals: 'not-an-array' } });
    expect(result.ok).toBe(false);
    expect(await listActiveGoals()).toEqual(before); // nothing was touched — validation is pure
  });

  it('rejects a backup from a newer schema version than this app understands', () => {
    const result = validateImportDoc({ format: 'goal-backward-planner', schemaVersion: 999, data: { goals: [], activities: [], milestones: [], weeklyPlans: [], tasks: [], entries: [] } });
    expect(result.ok).toBe(false);
  });

  it('merge mode adds new records and keeps existing ones', async () => {
    // "Device A": create Goal A, export it, then wipe — Goal A now exists ONLY in the export file.
    const goalIdA = await seedGoal('Goal A');
    const exportedA = await exportSnapshot();
    const db = getDb();
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    await ensureSettings();

    // "Device B": a different goal already exists locally; merging device A's export
    // in must ADD Goal A's records without disturbing Goal B's.
    await seedGoal('Goal B');
    const validation = validateImportDoc(exportedA);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const { inserted } = await applyImport(validation.doc, 'merge');
    expect(inserted).toBeGreaterThan(0);

    const goals = await listActiveGoals();
    expect(goals.map((g) => g.name).sort()).toEqual(['Goal A', 'Goal B']);
    expect(await listActivitiesForGoal(goalIdA)).toHaveLength(2); // Goal A's own activities survived the merge
  });

  it('applyImportWithSafetyExport downloads a safety backup of CURRENT data before wiping on replace', async () => {
    // Build a distinct "incoming" backup on a clean slate, then restore "Original" as the
    // data actually present when applyImportWithSafetyExport runs (so replace has a real effect).
    const db = getDb();
    await seedGoal('Incoming');
    const incoming = await exportSnapshot();
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    await ensureSettings();
    await seedGoal('Original');

    const dom = stubMinimalDom();
    try {
      await applyImportWithSafetyExport(incoming, 'replace');
      expect(dom.anchors).toHaveLength(1);
      expect(dom.anchors[0]!.clicked).toBe(true);
      expect(dom.anchors[0]!.download).toMatch(/^goal-planner-backup-\d{4}-\d{2}-\d{2}\.json$/);
    } finally {
      dom.restore();
    }

    // The replace itself still applied correctly afterward.
    const goals = await listActiveGoals();
    expect(goals.map((g) => g.name)).toEqual(['Incoming']);
  });

  it('applyImport (the core DB mutation) never touches the browser — safe to call directly in a replace test', async () => {
    await seedGoal('Original');
    const backupOfOther = await exportSnapshot();
    await applyImport(backupOfOther, 'replace'); // no exportBackupFile() call inside — no DOM needed
    expect((await listActiveGoals())[0]!.name).toBe('Original');
  });
});
