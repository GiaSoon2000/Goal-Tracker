import { NavLink } from 'react-router-dom';
import { cls } from '../ui/cls';
import s from './BottomNav.module.css';

const TABS = [
  { to: '/today', label: 'Today', icon: '◷' },
  { to: '/goals', label: 'Goals', icon: '◎' },
  { to: '/plan', label: 'Plan', icon: '▤' },
  { to: '/progress', label: 'Progress', icon: '◻' },
  { to: '/more', label: 'More', icon: '⋯' },
];

export function BottomNav() {
  return (
    <nav className={s.nav} aria-label="Main">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={cls(s.item)}>
          <span className={s.icon} aria-hidden="true">
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
