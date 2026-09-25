import { defaultSettings } from '../domain/defaults';
import { getDb } from '../db/database';
import type { Settings } from '../domain/types';

/** Pure read — safe to use as a useLiveQuery querier, which must never write. */
export async function getSettingsSnapshot(): Promise<Settings | null> {
  const db = getDb();
  return (await db.settings.get('singleton')) ?? null;
}

/** Get-or-create. Called ONCE at boot (never inside a liveQuery querier — writes are forbidden there). */
export async function ensureSettings(): Promise<Settings> {
  const db = getDb();
  const existing = await db.settings.get('singleton');
  if (existing) return existing;
  const fresh = defaultSettings(Date.now());
  await db.settings.put(fresh);
  return fresh;
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id' | 'createdAt'>>): Promise<void> {
  const db = getDb();
  const current = await ensureSettings();
  await db.settings.put({ ...current, ...patch, updatedAt: Date.now() });
}
