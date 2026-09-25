import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScreenHeader } from '../../app/ScreenHeader';
import { useConfirm } from '../../app/providers/ConfirmProvider';
import { useToast } from '../../app/providers/ToastProvider';
import { formatMonthYear, resolveDeadline } from '../../domain/date';
import type { ReplanResult } from '../../domain/planner/replan';
import { useGoalDetail } from '../../hooks/useGoalDetail';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { archiveGoal, deleteGoalCascade, setGoalStatus, undoGoalDelete } from '../../repo/goalRepo';
import { setMilestoneStatus } from '../../repo/milestoneRepo';
import { applyReplan, previewReplan } from '../../repo/replanRepo';
import { Button } from '../../ui/Button';
import { ProgressBar } from '../../ui/ProgressBar';
import { StatusBadge } from '../../ui/StatusBadge';
import { cls } from '../../ui/cls';
import type { Activity, GoalId, MilestoneId, MilestoneStatus } from '../../domain/types';
import { QuickLogSheet } from './QuickLogSheet';
import { ReplanPreviewSheet } from './ReplanPreviewSheet';
import s from './GoalDetailScreen.module.css';

export function GoalDetailScreen() {
  const { goalId } = useParams<{ goalId: string }>();
  const today = useToday();
  const settings = useSettings();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { data } = useGoalDetail((goalId ?? '') as GoalId, today, settings.weekStartsOn);
  const [replanDiff, setReplanDiff] = useState<ReplanResult | null>(null);
  const [loggingActivity, setLoggingActivity] = useState<Activity | null>(null);

  if (!data.goal) {
    return (
      <>
        <ScreenHeader title="Goal" />
        <div className="content">
          <p>This goal was deleted.</p>
        </div>
      </>
    );
  }

  const { goal, activities, progress, weekSummary, milestones } = data;

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete "${goal!.name}"?`,
      description: 'This moves to Recently deleted for 30 days.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const trashEntry = await deleteGoalCascade(goal!.id);
    void navigate('/goals');
    toast.show(`"${goal!.name}" deleted`, { undo: () => void undoGoalDelete(trashEntry.id) });
  }

  async function handleReplan() {
    const diff = await previewReplan(goal!.id, today, settings.weekStartsOn);
    setReplanDiff(diff);
  }

  async function handleApplyReplan() {
    if (!replanDiff) return;
    await applyReplan(goal!.id, replanDiff, settings.weekStartsOn);
    setReplanDiff(null);
    toast.show('Plan updated');
  }

  async function handleToggleMilestone(id: MilestoneId, currentStatus: MilestoneStatus) {
    await setMilestoneStatus(id, currentStatus === 'done' ? 'pending' : 'done');
  }

  async function handleArchive() {
    const ok = await confirm({
      title: `Archive "${goal!.name}"?`,
      description: 'It leaves Goals and Today, but every past log and completed task stays readable. Pending tasks for today onward are removed. You can unarchive it anytime.',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    await archiveGoal(goal!.id, today);
    void navigate('/goals');
    toast.show(`"${goal!.name}" archived`);
  }

  return (
    <>
      <ScreenHeader
        title={goal.name}
        action={
          <button type="button" onClick={() => void handleDelete()} aria-label="More actions" style={{ fontSize: 20 }}>
            ⋯
          </button>
        }
      />
      <div className="content" style={{ padding: 16 }}>
        <div className={s.hero}>
          {progress?.currentValue !== null && progress?.targetValue !== null ? (
            <>
              <div className={s.subtitle}>
                {progress?.currentValue} → {progress?.targetValue} {progress?.unit}
              </div>
              <div className={s.heroRow}>
                <div className={s.current}>Current: {progress?.currentValue}</div>
                {(() => {
                  const outcome = activities.find((a) => a.role === 'outcome');
                  return outcome ? (
                    <button type="button" className={s.logLink} onClick={() => setLoggingActivity(outcome)}>
                      + Log
                    </button>
                  ) : null;
                })()}
              </div>
            </>
          ) : (
            progress?.currentMilestone && <div className={s.subtitle}>Current milestone: {progress.currentMilestone.title}</div>
          )}
          {progress?.ratio !== null && progress?.ratio !== undefined && (
            <>
              <ProgressBar ratio={progress.ratio} label="Overall progress" />
              <div className={s.deadline}>{Math.round(progress.ratio * 100)}% complete</div>
            </>
          )}
          {goal.deadline && <div className={s.deadline}>Deadline: {formatMonthYear(resolveDeadline(goal.deadline))}</div>}
        </div>

        {weekSummary && weekSummary.rows.length > 0 && (
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <span className={s.sectionTitle}>This week</span>
              <StatusBadge status={weekSummary.status} />
            </div>
            {weekSummary.rows
              .filter((r) => r.target !== null)
              .map((row) => {
                const activity = activities.find((a) => a.id === row.activityId);
                return (
                  <div key={row.activityId} className={s.row}>
                    <span>{row.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {row.actual} / {row.target}
                      {activity && (
                        <button type="button" className={s.logLink} onClick={() => setLoggingActivity(activity)}>
                          + Log
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        )}

        {milestones.length > 0 && (
          <div className={s.section}>
            <div className={s.sectionTitle}>Milestones</div>
            {milestones.map((m) => (
              <button key={m.id} type="button" className={s.milestone} onClick={() => void handleToggleMilestone(m.id, m.status)}>
                <span aria-hidden="true">{m.status === 'done' ? '●' : '○'}</span>
                <span className={cls(m.status === 'done' && s.milestoneDone)}>{m.title}</span>
              </button>
            ))}
          </div>
        )}

        <div className={s.actions}>
          <Button onClick={() => void navigate(`/goals/${goal!.id}/edit`)}>Edit</Button>
          {goal.status === 'archived' ? (
            <Button onClick={() => void setGoalStatus(goal!.id, 'active')}>Unarchive</Button>
          ) : (
            <>
              {goal.status === 'active' ? (
                <Button onClick={() => void setGoalStatus(goal!.id, 'paused')}>Pause</Button>
              ) : (
                <Button onClick={() => void setGoalStatus(goal!.id, 'active')}>Resume</Button>
              )}
              {goal.status === 'active' && <Button onClick={() => void handleReplan()}>Re-plan</Button>}
              <Button onClick={() => void handleArchive()}>Archive</Button>
            </>
          )}
        </div>
      </div>

      {replanDiff && <ReplanPreviewSheet diff={replanDiff} onApply={() => void handleApplyReplan()} onCancel={() => setReplanDiff(null)} />}
      {loggingActivity && (
        <QuickLogSheet
          goalId={goal.id}
          activity={loggingActivity}
          onClose={() => setLoggingActivity(null)}
          onLogged={() => {
            setLoggingActivity(null);
            toast.show('Saved');
          }}
        />
      )}
    </>
  );
}
