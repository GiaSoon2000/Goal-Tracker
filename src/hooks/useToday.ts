import { useEffect, useState } from 'react';
import { msUntilNextLocalMidnight, todayLocal } from '../domain/date';
import type { LocalDate } from '../domain/types';

/**
 * The app must survive midnight: a `const today = todayLocal()` captured at mount
 * would silently show yesterday's tasks on a phone left open overnight. This is
 * the ONLY legitimate source of "now" in the UI layer — domain functions always
 * take dates as parameters, which is what makes them testable.
 */
export function useToday(): LocalDate {
  const [date, setDate] = useState<LocalDate>(() => todayLocal());

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setDate(todayLocal());
        schedule();
      }, msUntilNextLocalMidnight(new Date()) + 1_000);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setDate(todayLocal()); // the phone may have been asleep; timers are unreliable
        window.clearTimeout(timer);
        schedule();
      }
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return date;
}
