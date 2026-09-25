/** Shown while a lazy route chunk (currently just /progress) is downloading. */
export function ScreenFallback() {
  return (
    <div style={{ padding: 16, color: 'var(--fg-muted)' }} role="status" aria-live="polite">
      Loading…
    </div>
  );
}
