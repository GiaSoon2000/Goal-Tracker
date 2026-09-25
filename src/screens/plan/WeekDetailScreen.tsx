import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ScreenHeader } from '../../app/ScreenHeader';
import { useToast } from '../../app/providers/ToastProvider';
import { asLocalDate, formatWeekRange, resolveDeadline } from '../../domain/date';
import { weekTargetsFor } from '../../domain/planner/weekTargets';
import { useWeekDetail } from '../../hooks/useWeekDetail';
import { useSettings } from '../../hooks/useSettings';
import { editWeekTargets, resetWeekToGenerated } from '../../repo/weeklyPlanRepo';
import { Button } from '../../ui/Button';
import type { WeeklyPlanId, WeeklyTarget } from '../../domain/types';
import s from './WeekDetailScreen.module.css';

export function WeekDetailScreen() {
  const { weekStart: weekStartParam } = useParams<{ weekStart: string }>();
  const weekStart = asLocalDate(weekStartParam ?? '');
  const settings = useSettings();
  const { data: rows } = useWeekDetail(weekStart);
  const toast = useToast();

  // Local editable copy per plan, only for plans the user has actually touched —
  // rendering falls back to `row.plan.targets` directly otherwise (no effect needed
  // to "seed" it: that fallback IS the seed, computed at render time).
  const [drafts, setDrafts] = useState<Record<string, WeeklyTarget[]>>({});

  function adjust(planId: WeeklyPlanId, baseTargets: WeeklyTarget[], activityId: string, delta: number) {
    setDrafts((prev) => ({
      ...prev,
      [planId]: (prev[planId] ?? baseTargets).map((t) => (t.activityId === activityId ? { ...t, amount: Math.max(0, t.amount + delta) } : t)),
    }));
  }

  async function handleSave(planId: WeeklyPlanId) {
    const targets = drafts[planId];
    if (!targets) return;
    await editWeekTargets(planId, targets);
    toast.show('Week updated');
  }

  async function handleReset(row: (typeof rows)[number]) {
    const deadlineDate = row.goal.deadline ? resolveDeadline(row.goal.deadline) : null;
    const targets = weekTargetsFor(row.activities, weekStart, settings.weekStartsOn, row.goal.startDate, deadlineDate);
    await resetWeekToGenerated(row.plan.id, targets);
    setDrafts((prev) => ({ ...prev, [row.plan.id]: targets }));
    toast.show('Reset to suggested');
  }

  return (
    <>
      <ScreenHeader title={formatWeekRange(weekStart, settings.weekStartsOn)} />
      <div style={{ padding: 16 }}>
        {rows.length === 0 && <p style={{ color: 'var(--fg-muted)' }}>No goals have a plan for this week.</p>}
        {rows.map((row) => {
          const draft = drafts[row.plan.id] ?? row.plan.targets;
          return (
            <div key={row.plan.id} className={s.goalSection}>
              <div className={s.goalName}>
                {row.goal.name}
                {row.plan.source === 'edited' && <span className={s.badge}>Edited</span>}
                {row.plan.source === 'replanned' && <span className={s.badge}>Re-planned</span>}
              </div>
              {draft.map((target) => {
                const activity = row.activities.find((a) => a.id === target.activityId);
                if (!activity) return null;
                return (
                  <div key={target.activityId} className={s.row}>
                    <span>{activity.name}</span>
                    <span className={s.stepper}>
                      <button type="button" className={s.stepperButton} onClick={() => adjust(row.plan.id, row.plan.targets, target.activityId, -1)}>
                        −
                      </button>
                      <span>{target.amount}</span>
                      <button type="button" className={s.stepperButton} onClick={() => adjust(row.plan.id, row.plan.targets, target.activityId, 1)}>
                        +
                      </button>
                    </span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Button variant="primary" onClick={() => void handleSave(row.plan.id)}>
                  Save
                </Button>
                {row.plan.source !== 'generated' && <button type="button" className={s.resetLink} onClick={() => void handleReset(row)}>
                  Reset to suggested
                </button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
