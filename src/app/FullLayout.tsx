import { Outlet } from 'react-router-dom';
import s from './FullLayout.module.css';

/** Full-screen routes render their own ScreenHeader; this wrapper only owns safe-area padding. */
export function FullLayout() {
  return (
    <div className={s.wrap}>
      <Outlet />
    </div>
  );
}
