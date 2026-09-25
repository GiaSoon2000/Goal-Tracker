import type { Activity, DisplayUnit, TrackEntryOf, TrackKind, TrackValue } from './types';
import { formatEntry } from './units';

export interface TrackKindAdapter<K extends TrackKind = TrackKind> {
  kind: K;
  label: string;
  /** Aggregate suggested when an activity of this kind is created. */
  defaultAggregate: 'count' | 'sum' | 'latest' | 'mean';
  /** Numeric projection used by 'sum' / 'latest' / 'mean'. Always the canonical number. */
  toNumber(v: TrackEntryOf<K>['value']): number;
  emptyValue(a: Activity): TrackEntryOf<K>['value'];
  format(v: TrackEntryOf<K>['value'], a: Activity, display: DisplayUnit): string;
}

export const TRACK_KINDS: { [K in TrackKind]: TrackKindAdapter<K> } = {
  metric: {
    kind: 'metric',
    label: 'Metric',
    defaultAggregate: 'latest',
    toNumber: (v) => v.n,
    emptyValue: () => ({ n: 0, entryValue: 0, entryUnit: 'kg' }),
    format: (v, _a, display) => formatEntry(v, display),
  },
  habit: {
    kind: 'habit',
    label: 'Habit',
    defaultAggregate: 'count',
    toNumber: () => 1,
    emptyValue: () => ({ done: true }),
    format: () => 'Done',
  },
  duration: {
    kind: 'duration',
    label: 'Duration',
    defaultAggregate: 'sum',
    toNumber: (v) => v.minutes,
    emptyValue: () => ({ minutes: 0, entryValue: 0, entryUnit: 'min' }),
    format: (v, _a, display) => formatEntry({ n: v.minutes, entryValue: v.entryValue, entryUnit: v.entryUnit }, display),
  },
  session: {
    kind: 'session',
    label: 'Session',
    defaultAggregate: 'count',
    toNumber: (v) => v.count,
    emptyValue: () => ({ count: 1, minutes: null, intensity: null }),
    format: (v) => (v.minutes ? `${v.count} session · ${v.minutes} min` : `${v.count} session`),
  },
};

/**
 * Returns undefined for kinds this build does not know — forward-compat for future
 * kinds. The cast is safe: callers narrow on `kind` before invoking a type-specific
 * method, exactly as the runtime `in` check above already guarantees.
 */
export function adapterFor(kind: string): TrackKindAdapter | undefined {
  if (!(kind in TRACK_KINDS)) return undefined;
  return TRACK_KINDS[kind as TrackKind] as unknown as TrackKindAdapter;
}

export function toNumber(kind: TrackKind, value: TrackValue): number {
  const adapter = TRACK_KINDS[kind] as TrackKindAdapter;
  return adapter.toNumber(value as never);
}
