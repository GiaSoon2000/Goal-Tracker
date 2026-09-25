import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { firstDayOfMonth, formatMonthYear, formatWeekRange, monthKey, startOfWeek } from '../../domain/date';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { useActiveGoals } from '../../hooks/useGoals';
import { listAllWeekPlans } from '../../repo/weeklyPlanRepo';
import { useLive } from '../../hooks/useLive';
import { EmptyState } from '../../ui/EmptyState';
import type { WeeklyPlan } from '../../domain/types';

const NONE: WeeklyPlan[] = [];

export function PlanScreen() {
  const today = useToday();
  const settings = useSettings();
  const { data: goals } = useActiveGoals();
  const weekStart = startOfWeek(today, settings.weekStartsOn);

  const { data: plans } = useLive(listAllWeekPlans, [], NONE);

  const grouped = useMemo(() => {
    const byMonth = new Map<string, WeeklyPlan[]>();
    for (const plan of plans) {
      const key = monthKey(plan.weekStart);
      const list = byMonth.get(key) ?? [];
      list.push(plan);
      byMonth.set(key, list);
    }
    return [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [plans]);

  if (goals.length === 0) {
    return <EmptyState icon="▤" title="No plan yet" description="Create a goal to see its weekly plan here." />;
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, paddingBlock: 16 }}>Plan</h1>
      {grouped.map(([month, weeks]) => (
        <div key={month} style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--fg-muted)' }}>{formatMonthYear(firstDayOfMonth(month))}</div>
          {[...new Set(weeks.map((w) => w.weekStart))].map((ws) => {
            const isCurrent = ws === weekStart;
            const weeksForStart = weeks.filter((w) => w.weekStart === ws);
            return (
              <Link key={ws} to={`/plan/${ws}`} style={{ display: 'block', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: isCurrent ? 700 : 400 }}>
                  {formatWeekRange(ws, settings.weekStartsOn)} {isCurrent && '(current)'}
                </div>
                {weeksForStart.map((w) => {
                  const goal = goals.find((g) => g.id === w.goalId);
                  return (
                    <div key={w.id} style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
                      {goal?.name}: {w.targets.map((t) => t.amount).join(', ')}
                    </div>
                  );
                })}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
