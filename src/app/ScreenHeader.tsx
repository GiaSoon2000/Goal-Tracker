import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import s from './FullLayout.module.css';

/** Every full-screen route's back header — one primary action per screen (spec §17). */
export function ScreenHeader({ title, action, onBack }: { title: string; action?: ReactNode; onBack?: () => void }) {
  const navigate = useNavigate();
  return (
    <header className={s.header}>
      <button type="button" className={s.back} onClick={() => (onBack ? onBack() : void navigate(-1))} aria-label="Back">
        ‹
      </button>
      <span className={s.title}>{title}</span>
      <div style={{ minWidth: 48, textAlign: 'right' }}>{action}</div>
    </header>
  );
}
