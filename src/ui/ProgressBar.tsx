import s from './ProgressBar.module.css';

/** `ratio` is clamped to [0,1] — a progress bar never goes negative or over 100% (spec D22). */
export function ProgressBar({ ratio, label }: { ratio: number; label?: string }) {
  const clamped = Math.min(1, Math.max(0, ratio));
  return (
    <div className={s.track} role="progressbar" aria-valuenow={Math.round(clamped * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={s.fill} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
