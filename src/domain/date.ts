/**
 * The whole date surface. All dates are local civil dates as 'YYYY-MM-DD' strings —
 * no timestamps, no UTC conversions in the public API. Lexicographic string
 * comparison equals chronological comparison, so `<`/`>`/`===` work directly.
 *
 * All arithmetic is done via a UTC-integer day count internally (`toUTC`/`fromUTC`,
 * both private), which makes it structurally impossible for a DST transition to
 * shift a result. Local wall-clock time is read in exactly one function: `todayLocal`.
 */
import type { Deadline, LocalDate, WeekKey, WeekStart } from './types';

const p2 = (n: number) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DAY_MS = 86_400_000;

/**
 * Format-checks AND round-trips: '2028-02-30' matches the regex shape but Feb has
 * no 30th, so `Date.UTC` normalizes it to Mar 1 — re-formatting then disagrees with
 * the input, which is exactly the signal used to reject it.
 */
export function isLocalDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function asLocalDate(s: string): LocalDate {
  if (!isLocalDate(s)) throw new RangeError(`Invalid LocalDate: ${s}`);
  return s;
}

/** The only place local wall-clock time is read. */
export function todayLocal(now: Date = new Date(), rolloverHour = 0): LocalDate {
  const t = new Date(now.getTime() - rolloverHour * 3_600_000);
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}` as LocalDate;
}

function toUTC(d: LocalDate): Date {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, day));
}
function fromUTC(t: Date): LocalDate {
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}` as LocalDate;
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const t = toUTC(d);
  t.setUTCDate(t.getUTCDate() + n);
  return fromUTC(t);
}
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS);
}
export function dayOfWeek(d: LocalDate): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return (((toUTC(d).getUTCDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6); // 0 = Monday
}
export function startOfWeek(d: LocalDate, weekStartsOn: WeekStart): WeekKey {
  const dow = toUTC(d).getUTCDay(); // 0 = Sunday
  const delta = (dow - weekStartsOn + 7) % 7;
  return addDays(d, -delta);
}
export function endOfWeek(d: LocalDate, weekStartsOn: WeekStart): LocalDate {
  return addDays(startOfWeek(d, weekStartsOn), 6);
}
export function addWeeks(w: WeekKey, n: number): WeekKey {
  return addDays(w, n * 7);
}
export function weekRange(weekStart: WeekKey): readonly [LocalDate, LocalDate] {
  return [weekStart, addDays(weekStart, 6)] as const;
}
export function weeksBetween(a: WeekKey, b: WeekKey): number {
  return Math.round(diffDays(a, b) / 7);
}
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out; // string <= comparison is valid for zero-padded YYYY-MM-DD
}
export function eachWeekStart(from: WeekKey, to: WeekKey): WeekKey[] {
  const out: WeekKey[] = [];
  for (let w = from; w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}
export function weekDays(w: WeekKey): [LocalDate, LocalDate, LocalDate, LocalDate, LocalDate, LocalDate, LocalDate] {
  return [w, addDays(w, 1), addDays(w, 2), addDays(w, 3), addDays(w, 4), addDays(w, 5), addDays(w, 6)];
}

export function monthKey(d: LocalDate): string {
  return d.slice(0, 7);
}
export function isoWeekLabel(d: LocalDate): string {
  // DISPLAY ONLY — never used for grouping (weeks are grouped by monthKey of weekStart).
  const t = toUTC(d);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${p2(week)}`;
}

export function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}
export function daysInMonth(y: number, m: number /* 1-12 */): number {
  return new Date(y, m, 0).getDate();
}
export function firstDayOfMonth(monthKeyStr: string): LocalDate {
  return asLocalDate(`${monthKeyStr}-01`);
}
export function lastDayOfMonth(monthKeyStr: string): LocalDate {
  const [y, m] = monthKeyStr.split('-').map(Number) as [number, number];
  return asLocalDate(`${monthKeyStr}-${p2(daysInMonth(y, m))}`);
}
/** Clamps to the last valid day: '2027-01-31' +1m => '2027-02-28'; '2028-01-31' +1m => '2028-02-29'. */
export function addMonthsClamped(d: LocalDate, n: number): LocalDate {
  const y0 = Number(d.slice(0, 4));
  const m0 = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  const target = m0 - 1 + n;
  const y = y0 + Math.floor(target / 12);
  const m = (((target % 12) + 12) % 12) + 1;
  return asLocalDate(`${String(y).padStart(4, '0')}-${p2(m)}-${p2(Math.min(day, daysInMonth(y, m)))}`);
}
export function monthsBetween(a: LocalDate, b: LocalDate): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}
export function clampDate(d: LocalDate, min: LocalDate, max: LocalDate): LocalDate {
  return d < min ? min : d > max ? max : d;
}
export function daysRemaining(from: LocalDate, deadline: LocalDate): number {
  return diffDays(from, deadline);
}

/**
 * Resolves month-precision deadlines ('2027-03') to the LAST day of that month —
 * generous, and it matches how a person means "by the end of March" (spec §2).
 */
export function resolveDeadline(d: Deadline): LocalDate {
  if (d.precision === 'day') return d.value;
  return lastDayOfMonth(d.value);
}

/* Display formatting — all via Intl, never a date library. */
const fmt = (opts: Intl.DateTimeFormatOptions) => (d: LocalDate) => new Intl.DateTimeFormat(undefined, opts).format(toUTC(d));

export const formatDay = fmt({ weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const formatFullDate = fmt({ day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const formatMonthYear = fmt({ month: 'long', year: 'numeric', timeZone: 'UTC' });

export function formatWeekRange(weekStart: WeekKey, weekStartsOn: WeekStart): string {
  const end = endOfWeek(weekStart, weekStartsOn);
  const short = (d: LocalDate) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toUTC(d));
  return `${short(weekStart)} – ${short(end)}`;
}
export function formatRelativeDay(d: LocalDate, today: LocalDate): string {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  if (d === addDays(today, -1)) return 'Yesterday';
  return formatDay(d);
}

/** Next LOCAL midnight after `now`, for a self-rescheduling ticker (see hooks/useToday.ts). */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1_000, next.getTime() - now.getTime());
}
