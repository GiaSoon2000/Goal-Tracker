import { useState } from 'react';
import { useActiveGoals } from '../../hooks/useGoals';
import { useGoalsScreen } from '../../hooks/useGoalsScreen';
import { EmptyState } from '../../ui/EmptyState';
import { ProgressBar } from '../../ui/ProgressBar';

/**
 * A minimal first slice: per-goal overall progress. The full chart set (line
 * chart with outcome band, weekly planned-vs-actual bars, calendar heatmap) is
 * UX-FLOWS.md §6 / DATA-MODEL.md §3.2 follow-up work — the progress MATH those
 * charts would render (ratio, band, adherence) is already implemented and tested.
 */
export function ProgressScreen() {
  const { data: goals } = useActiveGoals();
  const { data: rows } = useGoalsScreen();
  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected ?? goals[0]?.id ?? null;

  if (goals.length === 0) {
    return <EmptyState icon="◻" title="Nothing to show yet" description="Progress appears here once you have an active goal." />;
  }

  const row = rows.find((r) => r.goal.id === activeId);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, paddingBlock: 16 }}>Progress</h1>
      <select value={activeId ?? ''} onChange={(e) => setSelected(e.target.value)} style={{ width: '100%', minHeight: 48, marginBottom: 24, borderRadius: 8, border: '1px solid var(--border)' }}>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {row && (
        <div>
          {row.progress.ratio !== null ? (
            <>
              <ProgressBar ratio={row.progress.ratio} label={`${row.goal.name} progress`} />
              <p style={{ marginTop: 8 }}>{Math.round(row.progress.ratio * 100)}% complete</p>
            </>
          ) : (
            <p style={{ color: 'var(--fg-muted)' }}>This is an ongoing habit — no completion percentage to show.</p>
          )}
          {row.progress.milestonesTotal > 0 && (
            <p style={{ marginTop: 16 }}>
              Milestones: {row.progress.milestonesDone} of {row.progress.milestonesTotal} complete
            </p>
          )}
        </div>
      )}
    </div>
  );
}
