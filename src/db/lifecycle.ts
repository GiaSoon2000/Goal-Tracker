import type { GoalPlannerDb } from './database';

/** Handles a schema upgrade happening in another tab (EDGE-CASES.md EC-S06). */
export function installDbLifecycle(db: GoalPlannerDb, onNeedsReload: (reason: 'versionchange' | 'blocked') => void): void {
  db.on('versionchange', () => {
    db.close(); // let the other tab's upgrade proceed
    onNeedsReload('versionchange');
  });
  db.on('blocked', () => onNeedsReload('blocked'));
}
