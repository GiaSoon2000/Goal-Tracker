import type { GoalType } from '../../../domain/types';
import s from '../GoalFormScreen.module.css';

interface Props {
  type: GoalType;
  name: string;
  onNameChange: (v: string) => void;
  startValue: string;
  onStartValueChange: (v: string) => void;
  targetValue: string;
  onTargetValueChange: (v: string) => void;
  unit: string;
  onUnitChange: (v: string) => void;
  currentLevel: string;
  onCurrentLevelChange: (v: string) => void;
  targetOutcome: string;
  onTargetOutcomeChange: (v: string) => void;
}

export function BasicsStep({ type, name, onNameChange, startValue, onStartValueChange, targetValue, onTargetValueChange, unit, onUnitChange, currentLevel, onCurrentLevelChange, targetOutcome, onTargetOutcomeChange }: Props) {
  return (
    <div>
      <div className={s.field}>
        <label className={s.label} htmlFor="goal-name">
          Name
        </label>
        <input id="goal-name" className={s.input} value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Fitness" autoFocus />
      </div>

      {type === 'metric' && (
        <div className={s.row}>
          <div className={s.field}>
            <label className={s.label} htmlFor="start-value">
              Current
            </label>
            <input id="start-value" className={s.input} inputMode="decimal" value={startValue} onChange={(e) => onStartValueChange(e.target.value)} placeholder="43" />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="target-value">
              Target
            </label>
            <input id="target-value" className={s.input} inputMode="decimal" value={targetValue} onChange={(e) => onTargetValueChange(e.target.value)} placeholder="50" />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="unit">
              Unit
            </label>
            <input id="unit" className={s.input} value={unit} onChange={(e) => onUnitChange(e.target.value)} placeholder="kg" />
          </div>
        </div>
      )}

      {type === 'skill' && (
        <div className={s.row}>
          <div className={s.field}>
            <label className={s.label} htmlFor="current-level">
              Current level
            </label>
            <input id="current-level" className={s.input} value={currentLevel} onChange={(e) => onCurrentLevelChange(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="target-outcome">
              Goal
            </label>
            <input id="target-outcome" className={s.input} value={targetOutcome} onChange={(e) => onTargetOutcomeChange(e.target.value)} placeholder="Play 5 songs" />
          </div>
        </div>
      )}

      {(type === 'habit' || type === 'project') && <p className={s.hint}>That&apos;s it for the basics — timeline and capacity are next.</p>}
    </div>
  );
}
