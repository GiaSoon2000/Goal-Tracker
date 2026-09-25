import { useState } from 'react';
import { asLocalDate, todayLocal } from '../../domain/date';
import { parseDecimal } from '../../domain/num';
import { toCanonical } from '../../domain/units';
import { logEntry } from '../../repo/entryRepo';
import { Button } from '../../ui/Button';
import type { Activity, DisplayUnit, GoalId } from '../../domain/types';
import s from './QuickLogSheet.module.css';

/**
 * ≤2-tap logging (UX-FLOWS.md §8): a bottom sheet keyed by the activity's kind.
 * Reachable directly from Goal Detail for any activity — this is the only way to
 * log a metric/duration/session activity that isn't tied to a generated task
 * (e.g. an outcome activity with scheduling.mode:'none', like a weigh-in).
 */
export function QuickLogSheet({ goalId, activity, onClose, onLogged }: { goalId: GoalId; activity: Activity; onClose: () => void; onLogged: () => void }) {
  const [date, setDate] = useState<string>(todayLocal());
  const [rawValue, setRawValue] = useState('');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const localDate = asLocalDate(date);
    if (activity.kind === 'habit') {
      await logEntry({ goalId, activityId: activity.id, kind: 'habit', value: { done: true }, date: localDate });
    } else if (activity.kind === 'metric') {
      const n = parseDecimal(rawValue);
      if (n === null) {
        setError('Enter a number.');
        return;
      }
      const unit = (activity.unit ?? 'count') as DisplayUnit;
      await logEntry({ goalId, activityId: activity.id, kind: 'metric', value: { n: toCanonical(n, unit), entryValue: n, entryUnit: unit }, date: localDate });
    } else if (activity.kind === 'duration') {
      const n = parseDecimal(rawValue);
      if (n === null) {
        setError('Enter minutes.');
        return;
      }
      await logEntry({ goalId, activityId: activity.id, kind: 'duration', value: { minutes: n, entryValue: n, entryUnit: 'min' }, date: localDate });
    } else {
      const count = parseDecimal(rawValue) ?? 1;
      const mins = parseDecimal(minutes);
      await logEntry({ goalId, activityId: activity.id, kind: 'session', value: { count, minutes: mins, intensity: null }, date: localDate });
    }
    onLogged();
  }

  return (
    <div className={s.overlay} role="presentation" onClick={onClose}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="log-title" onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <h2 id="log-title" className={s.title}>
            Log {activity.name}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <p className={s.error}>{error}</p>}

        {activity.kind === 'habit' ? (
          <p style={{ marginBottom: 16, color: 'var(--fg-muted)' }}>Mark this as done for the selected date.</p>
        ) : (
          <div className={s.field}>
            <input className={s.input} inputMode="decimal" value={rawValue} onChange={(e) => setRawValue(e.target.value)} placeholder="0" autoFocus />
            <span className={s.unit}>{activity.kind === 'duration' ? 'min' : (activity.unit ?? '')}</span>
          </div>
        )}

        {activity.kind === 'session' && (
          <div className={s.field}>
            <input className={s.input} inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutes (optional)" />
          </div>
        )}

        <input type="date" className={s.dateField} value={date} onChange={(e) => setDate(e.target.value)} max={todayLocal()} />

        <Button variant="primary" onClick={() => void handleSave()}>
          Save
        </Button>
      </div>
    </div>
  );
}
