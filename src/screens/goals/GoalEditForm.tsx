import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../app/providers/ToastProvider';
import { asLocalDate, todayLocal } from '../../domain/date';
import type { Deadline, Goal } from '../../domain/types';
import { updateGoal } from '../../repo/goalRepo';
import { Button } from '../../ui/Button';
import s from './GoalFormScreen.module.css';

/**
 * Editing changes the goal's own fields only — never its activities, milestones,
 * or existing weekly plans (that would risk silently invalidating history). A
 * deadline or config change here doesn't auto-regenerate the plan; the existing
 * Re-plan flow (Goal Detail) is the deliberate, previewed way to do that.
 */
export function GoalEditForm({ goal }: { goal: Goal }) {
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState(goal.name);
  const [description, setDescription] = useState(goal.description ?? '');
  const [startDate, setStartDate] = useState<string>(goal.startDate);
  const [deadlinePrecision, setDeadlinePrecision] = useState<'month' | 'day'>(goal.deadline?.precision ?? 'month');
  const [deadlineValue, setDeadlineValue] = useState(goal.deadline?.value ?? '');

  const [startValue, setStartValue] = useState(goal.type === 'metric' ? String(goal.config.startValue) : '');
  const [targetValue, setTargetValue] = useState(goal.type === 'metric' ? String(goal.config.targetValue) : '');
  const [unit, setUnit] = useState(goal.type === 'metric' ? goal.config.unit : 'kg');
  const [currentLevel, setCurrentLevel] = useState(goal.type === 'skill' ? goal.config.currentLevel : 'Beginner');
  const [targetOutcome, setTargetOutcome] = useState(goal.type === 'skill' ? goal.config.targetOutcome : '');

  const originalDeadlineKey = goal.deadline ? `${goal.deadline.precision}:${goal.deadline.value}` : '';
  const deadlineChanged = deadlineValue ? `${deadlinePrecision}:${deadlineValue}` !== originalDeadlineKey : originalDeadlineKey !== '';

  const canSubmit = name.trim().length > 0 && (deadlinePrecision === 'day' ? deadlineValue !== '' : deadlineValue !== '' || goal.type === 'habit');

  async function handleSubmit() {
    const deadline: Deadline | null = !deadlineValue ? null : deadlinePrecision === 'day' ? { precision: 'day', value: asLocalDate(deadlineValue) } : { precision: 'month', value: deadlineValue };

    let config: Goal['config'] = goal.config;
    if (goal.type === 'metric') {
      const sv = Number(startValue) || 0;
      const tv = Number(targetValue) || 0;
      config = { ...goal.config, direction: tv >= sv ? 'increase' : 'decrease', startValue: sv, targetValue: tv, unit };
    } else if (goal.type === 'skill') {
      config = { ...goal.config, currentLevel, targetOutcome };
    }

    const trimmedDescription = description.trim();
    await updateGoal(goal.id, { name: name.trim(), startDate: asLocalDate(startDate), deadline, config, ...(trimmedDescription ? { description: trimmedDescription } : {}) });
    void navigate(`/goals/${goal.id}`);
    if (deadlineChanged) toast.show('Saved — Re-plan from the goal page to update future weeks');
    else toast.show('Saved');
  }

  return (
    <div style={{ padding: 16 }}>
      <div className={s.field}>
        <label className={s.label} htmlFor="goal-name">
          Name
        </label>
        <input id="goal-name" className={s.input} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="goal-description">
          Description (optional)
        </label>
        <input id="goal-description" className={s.input} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {goal.type === 'metric' && (
        <div className={s.row}>
          <div className={s.field}>
            <label className={s.label} htmlFor="start-value">
              Current
            </label>
            <input id="start-value" className={s.input} inputMode="decimal" value={startValue} onChange={(e) => setStartValue(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="target-value">
              Target
            </label>
            <input id="target-value" className={s.input} inputMode="decimal" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="unit">
              Unit
            </label>
            <input id="unit" className={s.input} value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        </div>
      )}

      {goal.type === 'skill' && (
        <div className={s.row}>
          <div className={s.field}>
            <label className={s.label} htmlFor="current-level">
              Current level
            </label>
            <input id="current-level" className={s.input} value={currentLevel} onChange={(e) => setCurrentLevel(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="target-outcome">
              Goal
            </label>
            <input id="target-outcome" className={s.input} value={targetOutcome} onChange={(e) => setTargetOutcome(e.target.value)} />
          </div>
        </div>
      )}

      <div className={s.row}>
        <div className={s.field}>
          <label className={s.label} htmlFor="start-date">
            Start
          </label>
          <input id="start-date" type="date" className={s.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} max={todayLocal()} />
        </div>
        <div className={s.field}>
          <label className={s.label} htmlFor="deadline">
            Deadline {goal.type === 'habit' && '(optional)'}
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <select className={s.select} style={{ width: 70 }} value={deadlinePrecision} onChange={(e) => setDeadlinePrecision(e.target.value as 'month' | 'day')}>
              <option value="month">Month</option>
              <option value="day">Day</option>
            </select>
            <input id="deadline" type={deadlinePrecision === 'month' ? 'month' : 'date'} className={s.input} value={deadlineValue} onChange={(e) => setDeadlineValue(e.target.value)} />
          </div>
        </div>
      </div>

      {deadlineChanged && <p className={s.hint}>Changing the deadline won&apos;t update existing weeks by itself — use Re-plan afterward to redistribute the remaining work.</p>}

      <div className={s.footer}>
        <Button variant="primary" disabled={!canSubmit} onClick={() => void handleSubmit()}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
