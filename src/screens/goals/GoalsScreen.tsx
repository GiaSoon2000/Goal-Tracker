import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMonthYear, resolveDeadline } from '../../domain/date';
import { useGoalsByStatus } from '../../hooks/useGoals';
import { useGoalsScreen } from '../../hooks/useGoalsScreen';
import { EmptyState } from '../../ui/EmptyState';
import { ProgressBar } from '../../ui/ProgressBar';
import type { Goal, GoalStatus } from '../../domain/types';
import s from './GoalsScreen.module.css';

export function GoalsScreen() {
  const { data: rows, loading } = useGoalsScreen();

  return (
    <div>
      <div className={s.header}>
        <h1 className={s.title}>Goals</h1>
        <Link to="/goals/new" className={s.add} aria-label="Create goal">
          +
        </Link>
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState icon="◎" title="No goals yet" description="Create your first goal to get a backward plan." />
      ) : (
        <div className={s.list}>
          {rows.map(({ goal, progress }) => (
            <Link key={goal.id} to={`/goals/${goal.id}`} className={s.row}>
              <div className={s.name}>{goal.name}</div>
              <div className={s.subtitle}>{subtitleFor(goal, progress)}</div>
              {progress.ratio !== null && <ProgressBar ratio={progress.ratio} label={`${goal.name} progress`} />}
              <div className={s.meta}>
                {progress.ratio !== null && <span>{Math.round(progress.ratio * 100)}%</span>}
                {goal.deadline && <span>Deadline: {formatMonthYear(resolveDeadline(goal.deadline))}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <CollapsedStatusSection status="paused" label="Paused" />
      <CollapsedStatusSection status="archived" label="Archived" />
    </div>
  );
}

/** Goals that have left the active list are never a dead end — this is the only
 *  way back to a paused/archived goal, so it must exist even though it's rare (spec §8). */
function CollapsedStatusSection({ status, label }: { status: GoalStatus; label: string }) {
  const { data: goals } = useGoalsByStatus(status);
  const [open, setOpen] = useState(false);
  if (goals.length === 0) return null;

  return (
    <div className={s.collapsedSection}>
      <button type="button" className={s.collapsedHeader} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          {label} ({goals.length})
        </span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className={s.list}>
          {goals.map((goal: Goal) => (
            <Link key={goal.id} to={`/goals/${goal.id}`} className={s.row}>
              <div className={s.name}>{goal.name}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function subtitleFor(goal: { type: string; name: string }, progress: { currentValue: number | null; targetValue: number | null; unit: string | null; currentMilestone: { title: string } | null }): string {
  if (progress.currentValue !== null && progress.targetValue !== null) {
    return `${progress.currentValue} → ${progress.targetValue} ${progress.unit ?? ''}`.trim();
  }
  if (progress.currentMilestone) return `Current: ${progress.currentMilestone.title}`;
  return goal.type === 'habit' ? 'Ongoing habit' : 'In progress';
}
