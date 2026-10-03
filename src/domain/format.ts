/**
 * Plain-language descriptions of what an activity's weekly target NUMBER
 * actually means. Two activities can both default to "3" and mean completely
 * different things — e.g. the weightChange template's "Weight" (log 3x/week,
 * an outcome activity with scheduling.mode:'none') and "Workout" (do 3
 * sessions/week, an input activity that generates tasks). Nothing in the UI
 * said so before, which is exactly what made the Plan Review and Week Detail
 * screens hard to read — this is the fix.
 */
import type { ActivityRole, ActivityScheduling, ActivityTarget, TrackKind } from './types';

interface TargetShape {
  kind: TrackKind;
  role: ActivityRole;
  scheduling: ActivityScheduling;
  unit?: string | null;
}

/** The unit words that follow the number — "3 {unitLabel}" or "1 {unitLabel}" singular. */
export function targetUnitLabel(a: TargetShape, target: Pick<ActivityTarget, 'aggregate'>, amount = 2): string {
  const plural = amount !== 1;
  if (target.aggregate === 'sum' && a.unit) return `${a.unit} / week`; // a unit like 'min' never pluralizes
  if (a.role === 'outcome') return `${plural ? 'logs' : 'log'} / week`;
  if (a.kind === 'duration') return `${plural ? 'days' : 'day'} / week`;
  if (a.kind === 'session') return `${plural ? 'sessions' : 'session'} / week`;
  if (a.kind === 'habit') return `${plural ? 'days' : 'day'} / week`;
  return `${plural ? 'times' : 'time'} / week`;
}

/** The one-line explanation shown under the activity name. */
export function targetDescription(a: TargetShape): string {
  if (a.role === 'outcome') {
    return "This is your progress check-in, not a habit — how often you log it, logged from +Log. Never generates a task.";
  }
  if (a.scheduling.mode === 'none') {
    return "Logged directly from the goal's +Log button — no tasks are generated for this.";
  }
  return 'Generates a task on Today for each one, spread across your available days.';
}
