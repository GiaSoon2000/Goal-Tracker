import { Link } from 'react-router-dom';
import { formatMonthYear, resolveDeadline } from '../../domain/date';
import { useGoalsScreen } from '../../hooks/useGoalsScreen';
import { EmptyState } from '../../ui/EmptyState';
import { ProgressBar } from '../../ui/ProgressBar';
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
