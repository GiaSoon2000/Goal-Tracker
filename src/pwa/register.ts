import { registerSW } from 'virtual:pwa-register';

export interface UpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
}

/**
 * `registerType: 'prompt'` + `skipWaiting: false` (vite.config.ts): a new build
 * never activates under a running session — a re-plan or a half-typed form must
 * not be interrupted by a silent reload. The user decides, via the update banner.
 */
export function createUpdater(onChange: (s: UpdateState) => void): { applyUpdate: () => void } {
  let needRefresh = false;
  let offlineReady = false;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      onChange({ needRefresh, offlineReady });
    },
    onOfflineReady() {
      offlineReady = true;
      onChange({ needRefresh, offlineReady });
    },
    onRegisteredSW(_url, registration) {
      // Check hourly while the app is open; harmless offline (the fetch just fails).
      if (registration) {
        setInterval(() => void registration.update(), 60 * 60 * 1000);
      }
    },
  });

  return { applyUpdate: () => void updateSW(true) };
}
