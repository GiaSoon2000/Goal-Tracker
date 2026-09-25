import { useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useToday } from '../hooks/useToday';
import { ensureCurrentWeekMaterializedForActiveGoals } from '../repo/planWriteRepo';

/**
 * Complements the boot-time call in app/boot.ts: while the app stays open across
 * a midnight rollover, `useToday()`'s value changes and this re-runs, so a goal
 * left open for days keeps generating each new week's tasks without a reload.
 */
export function MaterializationEffect() {
  const today = useToday();
  const settings = useSettings();

  useEffect(() => {
    void ensureCurrentWeekMaterializedForActiveGoals(today, settings.weekStartsOn);
  }, [today, settings.weekStartsOn]);

  return null;
}
