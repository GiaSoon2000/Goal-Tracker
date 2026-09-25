import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  asLocalDate,
  clampDate,
  daysInMonth,
  diffDays,
  eachDay,
  eachWeekStart,
  endOfWeek,
  formatRelativeDay,
  isLeapYear,
  isLocalDate,
  lastDayOfMonth,
  monthKey,
  monthsBetween,
  msUntilNextLocalMidnight,
  resolveDeadline,
  startOfWeek,
  todayLocal,
  weekDays,
  weeksBetween,
} from './date';

describe('asLocalDate / isLocalDate', () => {
  it('accepts a well-formed date', () => {
    expect(asLocalDate('2026-09-19')).toBe('2026-09-19');
    expect(isLocalDate('2026-09-19')).toBe(true);
  });
  it('rejects malformed or impossible dates', () => {
    expect(isLocalDate('2028-02-30')).toBe(false); // Feb has no 30th, whole-string regex rejects it
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('not-a-date')).toBe(false);
    expect(() => asLocalDate('bad')).toThrow(RangeError);
  });
});

describe('addDays / diffDays — DST safety', () => {
  it('crosses the US spring-forward transition (23h day) with plain +1 day semantics', () => {
    expect(addDays(asLocalDate('2027-03-13'), 1)).toBe('2027-03-14');
  });
  it('crosses the EU fall-back transition (25h day) with plain +1 day semantics', () => {
    expect(addDays(asLocalDate('2026-10-24'), 1)).toBe('2026-10-25');
  });
  it('diffDays is symmetric and sign-correct across a fall-back boundary', () => {
    expect(diffDays(asLocalDate('2026-11-01'), asLocalDate('2026-11-02'))).toBe(1);
    expect(diffDays(asLocalDate('2026-11-02'), asLocalDate('2026-11-01'))).toBe(-1);
  });
  it('eachDay returns exactly 3 days across a DST boundary, never a duplicate or a gap', () => {
    expect(eachDay(asLocalDate('2027-03-13'), asLocalDate('2027-03-15'))).toHaveLength(3);
  });
});

describe('addMonthsClamped — leap years and month-end clamping', () => {
  it('clamps Jan 31 + 1 month to Feb 28 in a non-leap year', () => {
    expect(addMonthsClamped(asLocalDate('2027-01-31'), 1)).toBe('2027-02-28');
  });
  it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
    expect(addMonthsClamped(asLocalDate('2028-01-31'), 1)).toBe('2028-02-29');
  });
  it('handles a year rollover', () => {
    expect(addMonthsClamped(asLocalDate('2026-12-15'), 2)).toBe('2027-02-15');
  });
});

describe('isLeapYear / daysInMonth', () => {
  it.each([
    [2028, true],
    [2027, false],
    [2000, true],
    [1900, false],
  ])('isLeapYear(%i) === %s', (y, expected) => {
    expect(isLeapYear(y)).toBe(expected);
  });
  it('daysInMonth handles February in leap and non-leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
  });
});

describe('startOfWeek / endOfWeek', () => {
  it('resolves a Saturday to the preceding Monday when weekStartsOn = 1', () => {
    expect(startOfWeek(asLocalDate('2026-09-19'), 1)).toBe('2026-09-14');
  });
  it('resolves a Saturday to the preceding Sunday when weekStartsOn = 0', () => {
    expect(startOfWeek(asLocalDate('2026-09-19'), 0)).toBe('2026-09-13');
  });
  it('is idempotent for all 7 weekdays', () => {
    const monday = asLocalDate('2026-09-14');
    for (let i = 0; i < 7; i++) {
      expect(startOfWeek(addDays(monday, i), 1)).toBe(monday);
    }
  });
  it('endOfWeek is always 6 days after startOfWeek', () => {
    const w = startOfWeek(asLocalDate('2026-09-19'), 1);
    expect(diffDays(w, endOfWeek(w, 1))).toBe(6);
  });
});

describe('weeksBetween / eachWeekStart / weekDays', () => {
  it('counts whole weeks between two week starts', () => {
    expect(weeksBetween(asLocalDate('2026-09-14'), asLocalDate('2027-03-29'))).toBe(28);
  });
  it('eachWeekStart is inclusive of both bounds', () => {
    const weeks = eachWeekStart(asLocalDate('2026-09-14'), asLocalDate('2026-09-28'));
    expect(weeks).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
  });
  it('weekDays returns exactly 7 consecutive days starting at the given key', () => {
    const days = weekDays(asLocalDate('2026-09-14'));
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-09-14');
    expect(days[6]).toBe('2026-09-20');
  });
});

describe('monthKey / lastDayOfMonth / monthsBetween', () => {
  it('derives the month key from a date', () => {
    expect(monthKey(asLocalDate('2026-10-02'))).toBe('2026-10');
  });
  it('finds the last day of a leap-year February', () => {
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
  });
  it('finds the last day of March', () => {
    expect(lastDayOfMonth('2027-03')).toBe('2027-03-31');
  });
  it('counts months between two dates', () => {
    expect(monthsBetween(asLocalDate('2026-09-19'), asLocalDate('2027-03-19'))).toBe(6);
  });
});

describe('clampDate', () => {
  it('clamps below the minimum', () => {
    expect(clampDate(asLocalDate('2026-01-01'), asLocalDate('2026-06-01'), asLocalDate('2026-12-01'))).toBe('2026-06-01');
  });
  it('clamps above the maximum', () => {
    expect(clampDate(asLocalDate('2027-01-01'), asLocalDate('2026-06-01'), asLocalDate('2026-12-01'))).toBe('2026-12-01');
  });
  it('passes through when within range', () => {
    expect(clampDate(asLocalDate('2026-07-01'), asLocalDate('2026-06-01'), asLocalDate('2026-12-01'))).toBe('2026-07-01');
  });
});

describe('resolveDeadline — month-precision deadlines (spec §2 "March 2027")', () => {
  it('resolves a month-precision deadline to the last day of that month', () => {
    expect(resolveDeadline({ precision: 'month', value: '2027-03' })).toBe('2027-03-31');
  });
  it('resolves a leap-year February month-precision deadline correctly', () => {
    expect(resolveDeadline({ precision: 'month', value: '2028-02' })).toBe('2028-02-29');
  });
  it('passes a day-precision deadline through unchanged', () => {
    expect(resolveDeadline({ precision: 'day', value: asLocalDate('2027-03-15') })).toBe('2027-03-15');
  });
});

describe('formatRelativeDay', () => {
  const today = asLocalDate('2026-09-19');
  it('labels today, tomorrow and yesterday', () => {
    expect(formatRelativeDay(today, today)).toBe('Today');
    expect(formatRelativeDay(asLocalDate('2026-09-20'), today)).toBe('Tomorrow');
    expect(formatRelativeDay(asLocalDate('2026-09-18'), today)).toBe('Yesterday');
  });
  it('falls back to a formatted day otherwise', () => {
    expect(formatRelativeDay(asLocalDate('2026-09-01'), today)).not.toBe('Today');
  });
});

describe('todayLocal', () => {
  it('reads local calendar fields, not UTC', () => {
    const now = new Date(2026, 8, 19, 10, 0, 0); // local: 19 Sep 2026, 10:00
    expect(todayLocal(now)).toBe('2026-09-19');
  });
  it('applies the day-rollover hour', () => {
    const now = new Date(2026, 8, 20, 1, 30, 0); // local: 20 Sep, 01:30 — before a 3h rollover
    expect(todayLocal(now, 3)).toBe('2026-09-19');
  });
});

describe('msUntilNextLocalMidnight', () => {
  it('is positive and at least 1 second just before midnight', () => {
    const almostMidnight = new Date(2026, 8, 19, 23, 59, 59, 999);
    const ms = msUntilNextLocalMidnight(almostMidnight);
    expect(ms).toBeGreaterThanOrEqual(1_000);
    expect(ms).toBeLessThan(2_000);
  });
});
