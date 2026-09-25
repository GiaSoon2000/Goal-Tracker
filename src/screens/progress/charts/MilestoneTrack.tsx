import { cls } from '../../../ui/cls';
import s from './charts.module.css';

export interface MilestoneDot {
  id: string;
  title: string;
  done: boolean;
}

/** Milestone progress: completed vs remaining (spec §13), as a dot-track (UX-FLOWS.md §6). */
export function MilestoneTrack({ milestones }: { milestones: MilestoneDot[] }) {
  const doneCount = milestones.filter((m) => m.done).length;
  return (
    <div>
      <div className={s.milestoneTrack} role="img" aria-label={`${doneCount} of ${milestones.length} milestones complete`}>
        {milestones.map((m, i) => (
          <div key={m.id} style={{ display: 'contents' }}>
            <span className={cls(s.milestoneDot, m.done ? s.milestoneDotDone : s.milestoneDotPending)} title={m.title} />
            {i < milestones.length - 1 && <span className={cls(s.milestoneConnector, m.done && s.milestoneConnectorDone)} />}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 6 }}>
        {doneCount} of {milestones.length} complete
      </p>
    </div>
  );
}
