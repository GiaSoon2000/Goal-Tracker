import { todayLocal } from '../domain/date';
import { ensureSettings } from '../repo/settingsRepo';
import { purgeExpiredTrash } from '../repo/goalRepo';
import { ensureCurrentWeekMaterializedForActiveGoals } from '../repo/planWriteRepo';

/** Runs once at app start. Never inside a useLiveQuery querier — these are writes. */
export async function runBootTasks(): Promise<void> {
  const settings = await ensureSettings();
  await purgeExpiredTrash();
  // Covers a cold start on a day when one or more calendar weeks have already
  // passed since the goal was last opened — see MaterializationEffect for the
  // complementary case (the tab stays open across a midnight rollover).
  await ensureCurrentWeekMaterializedForActiveGoals(todayLocal(), settings.weekStartsOn);
}
