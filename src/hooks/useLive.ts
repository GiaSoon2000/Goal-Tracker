import { useLiveQuery } from 'dexie-react-hooks';

export interface Live<T> {
  data: T;
  loading: boolean;
}

/**
 * Subscribes to a Dexie query. `initial` is returned while loading so screens
 * render their real layout (with skeletons) instead of branching. INVARIANT:
 * `querier` must never resolve to `undefined` — `useLiveQuery` itself returns
 * `undefined` while the first query is in flight, and that is the ONLY thing
 * `undefined` is allowed to mean here.
 */
export function useLive<T>(querier: () => Promise<T>, deps: unknown[], initial: T): Live<T> {
  const data = useLiveQuery(querier, deps);
  return data === undefined ? { data: initial, loading: true } : { data, loading: false };
}
