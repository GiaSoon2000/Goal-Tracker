import { asLocalDate, resolveDeadline, weeksBetween } from '../../../domain/date';
import type { GoalTemplate } from '../../../domain/planner/templates';
import type { Deadline, GoalType } from '../../../domain/types';
import s from '../GoalFormScreen.module.css';

interface Props {
  template: GoalTemplate | undefined;
  activityAmounts: Record<number, number>;
  onAdjustAmount: (index: number, delta: number) => void;
  type: GoalType;
  startValue: string;
  targetValue: string;
  unit: string;
  startDate: string;
  deadline: Deadline | null;
}

/**
 * The step where §4's promise is literal: every generated number is editable
 * before anything is saved. A metric trajectory is always a RANGE (EC-P08) —
 * never a bare point estimate.
 */
export function PlanReviewStep({ template, activityAmounts, onAdjustAmount, type, startValue, targetValue, unit, startDate, deadline }: Props) {
  const trajectory = type === 'metric' && deadline ? trajectoryText(Number(startValue) || 0, Number(targetValue) || 0, unit, startDate, deadline) : null;

  return (
    <div>
      <p className={s.label} style={{ marginBottom: 12 }}>
        Suggested plan — edit any number
      </p>

      {template?.activities.map((a, i) =>
        a.defaultTarget ? (
          <div key={a.name} className={s.activityRow}>
            <span>{a.name}</span>
            <span className={s.stepper}>
              <button type="button" className={s.stepperButton} onClick={() => onAdjustAmount(i, -1)}>
                −
              </button>
              <span>{activityAmounts[i] ?? a.defaultTarget.amount}</span>
              <button type="button" className={s.stepperButton} onClick={() => onAdjustAmount(i, 1)}>
                +
              </button>
            </span>
          </div>
        ) : null,
      )}

      {trajectory && <p className={s.hint}>{trajectory}</p>}
      {template && template.milestones.length > 0 && <p className={s.hint}>{template.milestones.length} milestones will be scaffolded across the timeline — you can retitle and move them after creating the goal.</p>}
      <p className={s.hint}>A suggestion — edit anytime from the goal&apos;s Plan.</p>
    </div>
  );
}

function trajectoryText(startValue: number, targetValue: number, unit: string, startDate: string, deadline: Deadline): string {
  if (startValue === targetValue) return 'This is a maintenance goal — no weekly change is expected.';
  const deadlineDate = resolveDeadline(deadline);
  const weeks = Math.max(1, weeksBetween(asLocalDate(startDate), deadlineDate) + 1);
  const rate = (targetValue - startValue) / weeks;
  const lo = (Math.abs(rate) * 0.6).toFixed(2);
  const hi = (Math.abs(rate) * 1.4).toFixed(2);
  return `At this pace, roughly ${lo}–${hi} ${unit} per week — a range, not a prediction.`;
}
