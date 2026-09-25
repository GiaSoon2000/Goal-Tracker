import type { ReplanResult } from '../../domain/planner/replan';
import { Button } from '../../ui/Button';
import s from './ReplanPreviewSheet.module.css';

/**
 * The re-plan preview (spec §5 / §4: nothing is written until the user approves).
 * Summarized counts, not a week-by-week ledger — matches UX-FLOWS.md's intent
 * without needing the full Week Detail diff view for this pass.
 */
export function ReplanPreviewSheet({ diff, onApply, onCancel }: { diff: ReplanResult; onApply: () => void; onCancel: () => void }) {
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
        <div className={s.row}>
          <span className={s.rowLabel}>Weeks before this week</span>
          <span>{counts.frozen} unchanged</span>
        </div>
        <div className={s.row}>
          <span className={s.rowLabel}>Your edited weeks</span>
          <span>{counts.kept} kept</span>
        </div>
        <div className={s.row}>
          <span className={s.rowLabel}>Suggested weeks</span>
          <span>{counts.updated} updated</span>
        </div>
        {counts.removed > 0 && (
          <div className={s.row}>
            <span className={s.rowLabel}>Outside the new window</span>
            <span>{counts.removed} removed</span>
          </div>
        )}
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
