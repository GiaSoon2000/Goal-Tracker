import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { asLocalDate, todayLocal } from '../../domain/date';
import { newId } from '../../domain/ids';
import type { ActivityDraft } from '../../domain/planner/templates';
import { templatesForType } from '../../domain/planner/templates';
import type { Deadline, Goal, GoalColor, GoalType } from '../../domain/types';
import { createGoalWithPlan } from '../../repo/planWriteRepo';
import { useSettings } from '../../hooks/useSettings';
import { BasicsStep } from './steps/BasicsStep';
import { CapacityStep } from './steps/CapacityStep';
import { PlanReviewStep } from './steps/PlanReviewStep';
import { TimelineStep } from './steps/TimelineStep';
import { TypeStep } from './steps/TypeStep';
import { WizardHeader } from './WizardHeader';
import s from './GoalFormScreen.module.css';

const COLORS: GoalColor[] = ['teal', 'blue', 'green', 'amber', 'rose', 'violet', 'slate'];
const STEP_COUNT = 5;

/**
 * The 5-step wizard (UX-FLOWS.md §7): Type -> Basics -> Timeline -> Capacity ->
 * Plan Review, each answerable in a glance, ending on the one screen where
 * editing the generated plan (spec §4) is literal. Smart defaults throughout
 * keep the common path (accept the template, tweak nothing) to a few taps.
 */
export function GoalFormScreen() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [step, setStep] = useState(0);

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

  function selectTemplate(id: string) {
    setTemplateId(id);
    setActivityAmounts({});
    const t = templates.find((x) => x.id === id);
    if (t) setAvailableDaysPerWeek(t.suggestedAvailableDaysPerWeek);
  }

  function adjustAmount(index: number, delta: number) {
    const current = activityAmounts[index] ?? template?.activities[index]?.defaultTarget?.amount ?? 0;
    setActivityAmounts((prev) => ({ ...prev, [index]: Math.max(0, current + delta) }));
  }

  const deadline: Deadline | null = !deadlineValue ? null : deadlinePrecision === 'day' ? { precision: 'day', value: asLocalDate(deadlineValue) } : { precision: 'month', value: deadlineValue };

  const stepValid = [
    true, // Type — always has a default
    name.trim().length > 0 && (type !== 'metric' || (startValue !== '' && targetValue !== '')) && (type !== 'skill' || targetOutcome.trim() !== ''),
    deadlineValue !== '' || type === 'habit',
    true, // Capacity — a slider always has a value
    true, // Plan Review — the final Create action itself gates on the above
  ][step];

  async function handleSubmit() {
    if (!template) return;

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

  function handleNext() {
    if (step === STEP_COUNT - 1) {
      void handleSubmit();
    } else if (stepValid) {
      setStep(step + 1);
    }
  }

  function handleBack() {
    if (step === 0) void navigate(-1);
    else setStep(step - 1);
  }

  return (
    <>
      <WizardHeader step={step} stepCount={STEP_COUNT} onBack={handleBack} onNext={handleNext} nextLabel={step === STEP_COUNT - 1 ? 'Create' : 'Next'} nextDisabled={!stepValid} />
      <div className={s.stepBody}>
        {step === 0 && <TypeStep type={type} onTypeChange={selectType} templates={templates} templateId={templateId} onTemplateChange={selectTemplate} />}
        {step === 1 && (
          <BasicsStep
            type={type}
            name={name}
            onNameChange={setName}
            startValue={startValue}
            onStartValueChange={setStartValue}
            targetValue={targetValue}
            onTargetValueChange={setTargetValue}
            unit={unit}
            onUnitChange={setUnit}
            currentLevel={currentLevel}
            onCurrentLevelChange={setCurrentLevel}
            targetOutcome={targetOutcome}
            onTargetOutcomeChange={setTargetOutcome}
          />
        )}
        {step === 2 && <TimelineStep type={type} startDate={startDate} onStartDateChange={setStartDate} deadlinePrecision={deadlinePrecision} onDeadlinePrecisionChange={setDeadlinePrecision} deadlineValue={deadlineValue} onDeadlineValueChange={setDeadlineValue} />}
        {step === 3 && <CapacityStep availableDaysPerWeek={availableDaysPerWeek} onChange={setAvailableDaysPerWeek} />}
        {step === 4 && <PlanReviewStep template={template} activityAmounts={activityAmounts} onAdjustAmount={adjustAmount} type={type} startValue={startValue} targetValue={targetValue} unit={unit} startDate={startDate} deadline={deadline} />}
      </div>
    </>
  );
}
