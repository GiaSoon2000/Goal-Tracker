import { useState } from 'react';
import { useActiveGoals } from '../../hooks/useGoals';
import { useProgressCharts } from '../../hooks/useProgressCharts';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import { EmptyState } from '../../ui/EmptyState';
import { MetricLineChart } from './charts/MetricLineChart';
import { MilestoneTrack } from './charts/MilestoneTrack';
import { WeeklyConsistencyBars } from './charts/WeeklyConsistencyBars';
import type { GoalId } from '../../domain/types';

export function ProgressScreen() {
  const today = useToday();
  const settings = useSettings();
  const { data: goals } = useActiveGoals();
  const [selected, setSelected] = useState<GoalId | null>(null);
  const activeId = selected ?? goals[0]?.id ?? null;
  const { data: charts } = useProgressCharts((activeId ?? '') as GoalId, today, settings.weekStartsOn);

  if (goals.length === 0) {
    return <EmptyState icon="◻" title="Nothing to show yet" description="Progress appears here once you have an active goal." />;
  }

  const activeGoal = goals.find((g) => g.id === activeId);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, paddingBlock: 16 }}>Progress</h1>
      <select
        value={activeId ?? ''}
        onChange={(e) => setSelected(e.target.value as GoalId)}
        style={{ width: '100%', minHeight: 48, marginBottom: 24, borderRadius: 8, border: '1px solid var(--border)' }}
      >
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {charts.metric && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 8 }}>
            {activeGoal?.name} — {charts.metric.startValue} → {charts.metric.targetValue} {charts.metric.unit}
          </h2>
          <MetricLineChart
            entries={charts.metric.entries}
            startDate={charts.metric.startDate}
            deadlineDate={charts.metric.deadlineDate}
            startValue={charts.metric.startValue}
            targetValue={charts.metric.targetValue}
            decimals={charts.metric.decimals}
            unit={charts.metric.unit}
            today={today}
          />
        </section>
      )}

      {charts.weeks.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Weekly consistency (last {charts.weeks.length} weeks)</h2>
          <WeeklyConsistencyBars weeks={charts.weeks} weekStartsOn={settings.weekStartsOn} />
        </section>
      )}

      {charts.milestones.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Milestones</h2>
          <MilestoneTrack milestones={charts.milestones} />
        </section>
      )}

      {!charts.metric && charts.weeks.length === 0 && charts.milestones.length === 0 && (
        <p style={{ color: 'var(--fg-muted)' }}>This goal doesn&apos;t have a metric, weekly targets, or milestones to chart yet.</p>
      )}
    </div>
  );
}
