import { Outlet, ScrollRestoration } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import s from './TabLayout.module.css';

export function TabLayout() {
  return (
    <>
      <div className={s.page}>
        <Outlet />
      </div>
      <BottomNav />
      <ScrollRestoration />
    </>
  );
}
