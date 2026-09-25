import { ensureSettings } from '../repo/settingsRepo';
import { purgeExpiredTrash } from '../repo/goalRepo';

/** Runs once at app start. Never inside a useLiveQuery querier — these are writes. */
export async function runBootTasks(): Promise<void> {
  await ensureSettings();
  await purgeExpiredTrash();
}
