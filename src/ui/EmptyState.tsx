import type { ReactNode } from 'react';
import s from './EmptyState.module.css';

export function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className={s.wrap}>
      <span className={s.icon} aria-hidden="true">
        {icon}
      </span>
      <h2 className={s.title}>{title}</h2>
      {description && <p className={s.description}>{description}</p>}
      {action}
    </div>
  );
}
