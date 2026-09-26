import type { ReplanResult } from '../../domain/planner/replan';
import type { Activity } from '../../domain/types';
import { Button } from '../../ui/Button';
import s from './ReplanPreviewSheet.module.css';

interface ActivityChange {
  name: string;
  oldAmount: number;
  min: number;
  max: number;
}

/**
 * The actual number each activity's weekly target is moving to/from — the part a
 * plain week-count summary can't answer ("what will actually change?"). Uses
 * `activity.defaultTarget.amount` as "before" (the steady-state target the goal
 * was created with) and the range across the updated weeks as "after" — a range
 * because integer rounding can make one week 4 and another 5 to hit the same
 * total exactly (spec §4: never overstate precision). The very first updated
 * week is excluded from that range since it's often the current week, which can
 * be floored at whatever is already done and so isn't the steady-state number.
 */
function computeActivityChanges(diff: ReplanResult, activities: Activity[]): ActivityChange[] {
  const updated = diff.weeks.filter((w) => w.kind === 'replaced' || w.kind === 'created').sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0));
  const steadyStateWeeks = updated.length > 1 ? updated.slice(1) : updated;

  const changes: ActivityChange[] = [];
  for (const activity of activities) {
    if (activity.role !== 'input' || !activity.defaultTarget) continue;
    const amounts = steadyStateWeeks.map((w) => w.targets.find((t) => t.activityId === activity.id)?.amount).filter((a): a is number => a !== undefined);
    if (amounts.length === 0) continue;
    const oldAmount = activity.defaultTarget.amount;
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (min === oldAmount && max === oldAmount) continue; // genuinely unchanged — don't list it
    changes.push({ name: activity.name, oldAmount, min, max });
  }
  return changes;
}

/** Spec §5: re-planning redistributes remaining work across the weeks left before
 *  the deadline. Nothing is written until the user approves this preview. */
export function ReplanPreviewSheet({ diff, activities, onApply, onCancel }: { diff: ReplanResult; activities: Activity[]; onApply: () => void; onCancel: () => void }) {
  const changes = computeActivityChanges(diff, activities);
  const counts = {
    frozen: diff.weeks.filter((w) => w.kind === 'frozen').length,
    kept: diff.weeks.filter((w) => w.kind === 'kept').length,
    updated: diff.weeks.filter((w) => w.kind === 'replaced' || w.kind === 'created').length,
    removed: diff.weeks.filter((w) => w.kind === 'deleted' || w.kind === 'orphaned').length,
  };

  return (
    <div className={s.overlay} role="presentation" onClick={onCancel}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="replan-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="replan-title" className={s.title}>
          Re-plan this goal
        </h2>

        {changes.length > 0 ? (
          <>
            <p className={s.intro}>Going forward, each week will ask for:</p>
            {changes.map((c) => (
              <div key={c.name} className={s.changeRow}>
                <span>{c.name}</span>
                <span className={s.changeValue}>
                  {c.oldAmount} → {c.min === c.max ? c.min : `${c.min}–${c.max}`} <span className={s.perWeek}>/ week</span>
                </span>
              </div>
            ))}
          </>
        ) : (
          <p className={s.intro}>Your weekly targets aren&apos;t changing — only the week grid itself is being refreshed (e.g. after a deadline change).</p>
        )}

        <details className={s.details}>
          <summary className={s.detailsSummary}>What else this does</summary>
          <div className={s.row}>
            <span className={s.rowLabel}>Weeks before this week</span>
            <span>{counts.frozen} unchanged</span>
          </div>
          <div className={s.row}>
            <span className={s.rowLabel}>Your edited weeks</span>
            <span>{counts.kept} kept as you set them</span>
          </div>
          <div className={s.row}>
            <span className={s.rowLabel}>Suggested weeks</span>
            <span>{counts.updated} recalculated</span>
          </div>
          {counts.removed > 0 && (
            <div className={s.row}>
              <span className={s.rowLabel}>Outside the new window</span>
              <span>{counts.removed} removed</span>
            </div>
          )}
        </details>

        {diff.tight && <p className={s.warning}>⚠ Catching up fully would need more sessions than your scheduled days allow some weeks. You can still apply this — extra sessions can be logged directly.</p>}
        <div className={s.actions}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onApply}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
