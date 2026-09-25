import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createUpdater, type UpdateState } from '../../pwa/register';

interface UpdateApi extends UpdateState {
  applyUpdate: () => void;
}

const UpdateContext = createContext<UpdateApi | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState>({ needRefresh: false, offlineReady: false });
  const applyUpdateRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    // Registered once, after first paint, so service-worker install never competes
    // with rendering the Today screen (ARCHITECTURE.md §13's main.tsx boot-order note).
    const updater = createUpdater(setState);
    applyUpdateRef.current = updater.applyUpdate;
  }, []);

  return <UpdateContext.Provider value={{ ...state, applyUpdate: () => applyUpdateRef.current() }}>{children}</UpdateContext.Provider>;
}

export function useUpdate(): UpdateApi {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdate must be used within UpdateProvider');
  return ctx;
}
