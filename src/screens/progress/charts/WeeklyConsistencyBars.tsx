import { useState } from 'react';
import { formatWeekRange } from '../../../domain/date';
import type { LocalDate, WeekStart } from '../../../domain/types';
import s from './charts.module.css';

export interface WeekBar {
  weekStart: LocalDate;
  actual: number;
  target: number;
}

/**
 * Planned vs actual, per week (spec §13). One value (actual) is the point;
 * planned/target is a reference threshold, not a second identity series — drawn
 * as a dashed tick rather than a second bar, so no categorical legend is needed
 * (marks-and-anatomy.md: a single series needs no legend box).
 */
export function WeeklyConsistencyBars({ weeks, weekStartsOn }: { weeks: WeekBar[]; weekStartsOn: WeekStart }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maxValue = Math.max(1, ...weeks.map((w) => Math.max(w.actual, w.target)));
  const active = activeIndex !== null ? weeks[activeIndex] : null;

  return (
    <div>
      <div className={s.barsWrap}>
        {weeks.map((w, i) => {
          const heightPct = (w.actual / maxValue) * 100;
          const targetPct = (w.target / maxValue) * 100;
          return (
            <div key={w.weekStart} className={s.barColumn}>
              {w.target > 0 && <div className={s.barTarget} style={{ bottom: `${targetPct}%` }} />}
              <button
                type="button"
                className={s.bar}
                style={{ height: `${heightPct}%` }}
                aria-label={`${formatWeekRange(w.weekStart, weekStartsOn)}: ${w.actual} of ${w.target}`}
                onPointerEnter={() => setActiveIndex(i)}
                onPointerLeave={() => setActiveIndex(null)}
                onClick={() => setActiveIndex(activeIndex === i ? null : i)}
              />
            </div>
          );
        })}
      </div>
      <div style={{ height: 20 }}>
        {active && (
          <p style={{ fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' }}>
            {formatWeekRange(active.weekStart, weekStartsOn)}: {active.actual} of {active.target}
          </p>
        )}
      </div>
      <table className="srOnly">
        <caption>Weekly planned vs actual</caption>
        <thead>
          <tr>
            <th>Week</th>
            <th>Actual</th>
            <th>Planned</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <td>{formatWeekRange(w.weekStart, weekStartsOn)}</td>
              <td>{w.actual}</td>
              <td>{w.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
