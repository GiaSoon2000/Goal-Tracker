import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../../app/ScreenHeader';
import { asLocalDate, todayLocal } from '../../domain/date';
import { newId } from '../../domain/ids';
import type { ActivityDraft } from '../../domain/planner/templates';
import { templatesForType } from '../../domain/planner/templates';
import type { Deadline, Goal, GoalColor, GoalType } from '../../domain/types';
import { createGoalWithPlan } from '../../repo/planWriteRepo';
import { useSettings } from '../../hooks/useSettings';
import { Button } from '../../ui/Button';
import { cls } from '../../ui/cls';
import s from './GoalFormScreen.module.css';

const TYPES: { value: GoalType; label: string }[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'habit', label: 'Habit' },
  { value: 'skill', label: 'Skill' },
  { value: 'project', label: 'Project' },
];
const COLORS: GoalColor[] = ['teal', 'blue', 'green', 'amber', 'rose', 'violet', 'slate'];

/**
 * A single-screen creation flow for this first working slice. UX-FLOWS.md §7
 * specifies a polished 5-step wizard ending on an editable Plan Review step;
 * this compresses those same inputs (type -> template -> basics -> timeline ->
 * capacity -> editable targets) onto one scrollable form so the pipeline is
 * real and usable now. Splitting it into the full stepped wizard is follow-up
 * UI work, not a data-model or planning-engine change.
 */
export function GoalFormScreen() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [name, setName] = useState('');
  const [type, setType] = useState<GoalType>('metric');
  const templates = useMemo(() => templatesForType(type), [type]);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const template = templates.find((t) => t.id === templateId) ?? templates[0];

  const [startDate, setStartDate] = useState<string>(todayLocal());
  const [deadlinePrecision, setDeadlinePrecision] = useState<'month' | 'day'>('month');
  const [deadlineValue, setDeadlineValue] = useState('');
  const [availableDaysPerWeek, setAvailableDaysPerWeek] = useState(template?.suggestedAvailableDaysPerWeek ?? 3);

  const [startValue, setStartValue] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('kg');
  const [currentLevel, setCurrentLevel] = useState('Beginner');
  const [targetOutcome, setTargetOutcome] = useState('');

  const [activityAmounts, setActivityAmounts] = useState<Record<number, number>>({});
  const activities: ActivityDraft[] = useMemo(() => {
    if (!template) return [];
    return template.activities.map((a, i) => {
      if (!a.defaultTarget) return a;
      let amount = activityAmounts[i] ?? a.defaultTarget.amount;
      // Never silently exceed the days the user said they have available (spec §4/EXCEEDS_DAILY_CAPACITY).
      if (a.scheduling.mode === 'daysPerWeek' && a.defaultTarget.aggregate === 'count') {
        amount = Math.min(amount, availableDaysPerWeek);
      }
      return { ...a, defaultTarget: { ...a.defaultTarget, amount } };
    });
  }, [template, activityAmounts, availableDaysPerWeek]);

  function selectType(t: GoalType) {
    setType(t);
    const next = templatesForType(t);
    setTemplateId(next[0]?.id ?? '');
    setActivityAmounts({});
  }

  function adjustAmount(index: number, delta: number) {
    const current = activityAmounts[index] ?? template?.activities[index]?.defaultTarget?.amount ?? 0;
    setActivityAmounts((prev) => ({ ...prev, [index]: Math.max(0, current + delta) }));
  }

  const canSubmit = name.trim().length > 0 && !!template && (deadlinePrecision === 'day' ? deadlineValue !== '' : deadlineValue !== '' || type === 'habit');

  async function handleSubmit() {
    if (!template) return;
    const deadline: Deadline | null = !deadlineValue ? null : deadlinePrecision === 'day' ? { precision: 'day', value: asLocalDate(deadlineValue) } : { precision: 'month', value: deadlineValue };

    let config: Goal['config'];
    if (type === 'metric') {
      config = { direction: Number(targetValue) >= Number(startValue) ? 'increase' : 'decrease', startValue: Number(startValue) || 0, targetValue: Number(targetValue) || 0, unit, decimals: 1, paceBand: null };
    } else if (type === 'habit') {
      config = { horizon: deadline ? 'until-deadline' : 'ongoing' };
    } else if (type === 'skill') {
      config = { currentLevel, targetOutcome, levelScale: null };
    } else {
      config = { milestoneWeighting: 'equal' };
    }

    const goalId = await createGoalWithPlan(
      {
        name: name.trim(),
        type,
        startDate: asLocalDate(startDate),
        deadline,
        color: COLORS[newId().length % COLORS.length] ?? 'teal',
        config,
        activities,
        milestones: template.milestones,
      },
      settings.weekStartsOn,
    );
    void navigate(`/goals/${goalId}`);
  }

  return (
    <>
      <ScreenHeader title="New goal" action={<span />} />
      <div style={{ padding: 16 }}>
        <div className={s.field}>
          <label className={s.label} htmlFor="goal-name">
            Name
          </label>
          <input id="goal-name" className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fitness" />
        </div>

        <div className={s.field}>
          <span className={s.label}>Type</span>
          <div className={s.segmented}>
            {TYPES.map((t) => (
              <button key={t.value} type="button" className={cls(s.segmentButton, type === t.value && s.active)} onClick={() => selectType(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {templates.length > 0 && (
          <div className={s.field}>
            <label className={s.label} htmlFor="goal-template">
              Starting point
            </label>
            <select id="goal-template" className={s.select} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === 'metric' && (
          <div className={s.row}>
            <div className={s.field}>
              <label className={s.label} htmlFor="start-value">
                Current
              </label>
              <input id="start-value" className={s.input} inputMode="decimal" value={startValue} onChange={(e) => setStartValue(e.target.value)} placeholder="43" />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="target-value">
                Target
              </label>
              <input id="target-value" className={s.input} inputMode="decimal" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="50" />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="unit">
                Unit
              </label>
              <input id="unit" className={s.input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg" />
            </div>
          </div>
        )}

        {type === 'skill' && (
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
              <input id="target-outcome" className={s.input} value={targetOutcome} onChange={(e) => setTargetOutcome(e.target.value)} placeholder="Play 5 songs" />
            </div>
          </div>
        )}

        <div className={s.row}>
          <div className={s.field}>
            <label className={s.label} htmlFor="start-date">
              Start
            </label>
            <input id="start-date" type="date" className={s.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="deadline">
              Deadline {type === 'habit' && '(optional)'}
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

        <div className={s.field}>
          <label className={s.label} htmlFor="days-per-week">
            Days available per week: {availableDaysPerWeek}
          </label>
          <input id="days-per-week" type="range" min={1} max={7} value={availableDaysPerWeek} onChange={(e) => setAvailableDaysPerWeek(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        {template && template.activities.some((a) => a.defaultTarget) && (
          <div className={s.field}>
            <span className={s.label}>Suggested plan — edit any number</span>
            {template.activities.map((a, i) =>
              a.defaultTarget ? (
                <div key={a.name} className={s.activityRow}>
                  <span>{a.name}</span>
                  <span className={s.stepper}>
                    <button type="button" className={s.stepperButton} onClick={() => adjustAmount(i, -1)}>
                      −
                    </button>
                    <span>{activityAmounts[i] ?? a.defaultTarget.amount}</span>
                    <button type="button" className={s.stepperButton} onClick={() => adjustAmount(i, 1)}>
                      +
                    </button>
                  </span>
                </div>
              ) : null,
            )}
            <p className={s.hint}>A suggestion — edit anytime from the goal&apos;s Plan.</p>
          </div>
        )}

        <div className={s.footer}>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void handleSubmit()}>
            Create goal
          </Button>
        </div>
      </div>
    </>
  );
}
