import type { GoalType } from '../../../domain/types';
import s from '../GoalFormScreen.module.css';

interface Props {
  type: GoalType;
  startDate: string;
  onStartDateChange: (v: string) => void;
  deadlinePrecision: 'month' | 'day';
  onDeadlinePrecisionChange: (v: 'month' | 'day') => void;
  deadlineValue: string;
  onDeadlineValueChange: (v: string) => void;
}

export function TimelineStep({ type, startDate, onStartDateChange, deadlinePrecision, onDeadlinePrecisionChange, deadlineValue, onDeadlineValueChange }: Props) {
  return (
    <div>
      <div className={s.row}>
        <div className={s.field}>
          <label className={s.label} htmlFor="start-date">
            Start
          </label>
          <input id="start-date" type="date" className={s.input} value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
        </div>
        <div className={s.field}>
          <label className={s.label} htmlFor="deadline">
            Deadline {type === 'habit' && '(optional)'}
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <select className={s.select} style={{ width: 70 }} value={deadlinePrecision} onChange={(e) => onDeadlinePrecisionChange(e.target.value as 'month' | 'day')}>
              <option value="month">Month</option>
              <option value="day">Day</option>
            </select>
            <input id="deadline" type={deadlinePrecision === 'month' ? 'month' : 'date'} className={s.input} value={deadlineValue} onChange={(e) => onDeadlineValueChange(e.target.value)} />
          </div>
        </div>
      </div>
      <p className={s.hint}>A month is enough — &quot;March 2027&quot; works just like the spec example. Pick a day only if it&apos;s exact.</p>
    </div>
  );
}
