import { Link } from 'react-router-dom';
import { formatFullDate } from '../../domain/date';
import { useToday } from '../../hooks/useToday';
import { useSettings } from '../../hooks/useSettings';
import { useTodayScreen } from '../../hooks/useTodayScreen';
import { useToast } from '../../app/providers/ToastProvider';
import { completeTask, toggleStep, uncompleteTask } from '../../repo/taskRepo';
import { EmptyState } from '../../ui/EmptyState';
import { StatusBadge } from '../../ui/StatusBadge';
import { cls } from '../../ui/cls';
import type { DailyTask } from '../../domain/types';
import s from './TodayScreen.module.css';

export function TodayScreen() {
  const today = useToday();
  const settings = useSettings();
  const { data, loading } = useTodayScreen(today, settings.weekStartsOn);
  const toast = useToast();

  if (!loading && data.goals.length === 0) {
    return (
      <EmptyState
        icon="◷"
        title="No goals yet"
        description="Create a goal to get a plan for this week and today."
        action={
          <Link to="/goals/new" className="srOnly">
            Create a goal
          </Link>
        }
      />
    );
  }

  async function handleToggle(task: DailyTask) {
    if (task.steps.length > 0) return; // steps handle their own toggling below
    if (task.status === 'done') {
      await uncompleteTask(task.id);
    } else {
      await completeTask(task.id);
      toast.show('Done', { undo: () => void uncompleteTask(task.id) });
    }
  }

  return (
    <div>
      <div className={s.header}>
        <h1 className={s.title}>Today</h1>
        <span className={s.date}>{formatFullDate(today)}</span>
      </div>

      <div className={s.weekList}>
        {data.summaries.map((summary) => {
          const goal = data.goals.find((g) => g.id === summary.goalId);
          if (!goal) return null;
          const inputRow = summary.rows.find((r) => r.target !== null);
          return (
            <Link key={goal.id} to={`/goals/${goal.id}`} className={s.weekRow}>
              <span className={s.weekRowLeft}>
                <StatusBadge status={summary.status} />
                {goal.name}
              </span>
              <span className={s.weekRowRight}>
                {inputRow ? `${inputRow.actual} / ${inputRow.target} ${inputRow.name.toLowerCase()}` : '—'}
                <span className={s.chevron}>›</span>
              </span>
            </Link>
          );
        })}
      </div>

      <h2 className={s.sectionTitle}>Today&apos;s Tasks</h2>
      {data.tasks.length === 0 ? (
        <p style={{ color: 'var(--fg-muted)' }}>Nothing planned for today.</p>
      ) : (
        <ul className={s.taskList}>
          {data.tasks.map((task) => (
            <li key={task.id}>
              <button type="button" className={s.taskRow} onClick={() => void handleToggle(task)}>
                <span className={s.mark} aria-hidden="true">
                  {task.status === 'done' ? '●' : task.status === 'skipped' ? '–' : '○'}
                </span>
                <span className={s.taskBody}>
                  <div className={cls(s.taskTitle, task.status === 'done' && s.done)}>{task.title}</div>
                  {task.plannedMinutes && <div className={s.taskMeta}>{task.plannedMinutes} min</div>}
                </span>
              </button>
              {task.steps.length > 0 && (
                <ul>
                  {task.steps.map((step) => (
                    <li key={step.id}>
                      <button
                        type="button"
                        className={s.taskRow}
                        style={{ paddingLeft: 32 }}
                        onClick={() => void toggleStep(task.id, step.id)}
                      >
                        <span className={s.mark} aria-hidden="true">
                          {step.done ? '●' : '○'}
                        </span>
                        <span className={s.taskBody}>
                          <div className={cls(s.taskTitle, step.done && s.done)}>{step.title}</div>
                          {step.minutes && <div className={s.taskMeta}>{step.minutes} min</div>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
