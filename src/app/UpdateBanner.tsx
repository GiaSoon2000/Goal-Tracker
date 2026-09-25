import { useEffect, useState } from 'react';
import { useUpdate } from './providers/UpdateProvider';
import { useToast } from './providers/ToastProvider';
import s from './UpdateBanner.module.css';

/**
 * The only two strings this ever shows (ARCHITECTURE.md §6.5 — §17's "avoid
 * excessive text" applies to update copy too): a one-time "ready offline" toast,
 * and a persistent, dismissible "new version" bar above the bottom nav.
 */
export function UpdateBanner() {
  const { needRefresh, offlineReady, applyUpdate } = useUpdate();
  const [dismissed, setDismissed] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (offlineReady) toast.show('Ready to use offline.');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once when it flips true, not on every toast identity change
  }, [offlineReady]);

  if (!needRefresh || dismissed) return null;

  return (
    <div className={s.banner} role="status">
      <span>A new version is ready.</span>
      <span style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={s.reload} onClick={applyUpdate}>
          Reload
        </button>
        <button type="button" className={s.dismiss} onClick={() => setDismissed(true)} aria-label="Dismiss">
          ✕
        </button>
      </span>
    </div>
  );
}
