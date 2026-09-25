import type { TrackStatus } from '../domain/types';
import s from './StatusBadge.module.css';

/** Color never carries the only signal — every status pairs a color with a shape/word (UX-FLOWS.md §0). */
const SHAPES: Record<TrackStatus, string> = { on_track: '●', behind: '▲', ahead: '✦', no_target: '—' };
const LABELS: Record<TrackStatus, string> = { on_track: 'On track', behind: 'Behind', ahead: 'Ahead', no_target: '—' };

export function StatusBadge({ status }: { status: TrackStatus }) {
  return (
    <span className={[s.badge, s[status]].join(' ')}>
      <span aria-hidden="true">{SHAPES[status]}</span>
      {LABELS[status]}
    </span>
  );
}
