# Edge Cases, Failure Modes & Correctness Traps — Goal Backward Planner V1

**Dimension owner doc.** Scope: every way this app can be wrong, and the exact, committed handling for each.
Reference spec: `D:/Self Project/Goal Tracker/docs/SPEC.md`.

Every case below carries an ID (`EC-<area><n>`). Other dimension docs should cite these IDs rather than re-deciding.

---

## 0. Decisions table

| # | Decision | Rationale | Rejected alternative |
|---|---|---|---|
| D1 | **A "day" is a local civil date string `YYYY-MM-DD` (`LocalDate`), captured from the device's wall clock at the moment of the action, and never re-derived from a timestamp.** | A workout logged Friday evening in Tokyo must stay Friday forever, even after flying to LA. Re-deriving a day from a UTC instant is the #1 tracker bug. | Store UTC epoch and compute the day at read time → every timezone change silently rewrites history. |
| D2 | **All date arithmetic runs on UTC-midnight integers inside `src/lib/date/civil.ts`; nothing in the app ever adds `86400000` to a *local* Date.** | UTC has no DST, so `+n*86_400_000` is exactly `n` civil days. Local-time arithmetic breaks on 23h/25h days. | `date-fns`/`dayjs` — a dependency for ~120 lines of code we must audit anyway (§21 "prefer simple"). |
| D3 | **No component may call `new Date()`. `today` flows from a single `TodayProvider`; enforced by an ESLint `no-restricted-syntax` rule scoped outside `src/lib/time/**`.** | Makes midnight-rollover correctness structural, not a habit. Also makes every screen trivially testable by injecting a date. | Ad-hoc `new Date()` in components → the Today screen shows yesterday until reload (§7 is the default home screen; this is not acceptable). |
| D4 | **`missed` is never persisted. Stored task status is `pending \| done \| skipped`; `missed` is derived as `pending && date < today && !pausedOn(date)`.** | A persisted `missed` flag is wrong the moment the clock changes, the user backfills, or a goal is paused. Derivation is idempotent. | A nightly "mark missed" sweep → depends on the app being open at midnight; corrupts on clock skew. |
| D5 | **Three distinct task states with different arithmetic: `done` (counts in numerator+denominator), `skipped` (excluded from both), `missed` (denominator only).** | Skipping is an explicit re-plan decision (§11 "Allow: Completion, Skip"). Punishing it teaches the user to lie to their own tracker. | Treating skip as a miss → user stops using skip; data quality collapses. |
| D6 | **Measurements store a canonical value (kg, km, min, count) *plus* the raw `entry: {value, unit}` the user typed. Unit switching is display-only; no stored value is ever rewritten.** | The classic corruption trap. A convert-on-switch migration that half-fails, or round-trips 43.5 kg → 95.9 lb → 43.499999 kg, destroys the user's history irreversibly. | Convert stored values on unit switch → non-idempotent, non-atomic, unrecoverable. |
| D7 | **Weekly `actuals` are always derived from logs/tasks at read time. No aggregate is the source of truth.** | Kills the entire class of "edited a past log, progress didn't update" bugs (§5 re-planning depends on actuals being right). §16's `actuals` field is kept only as an optional render cache with an explicit `actualsStale` flag. | Persisted actuals incremented on write → every retro-edit/delete path must remember to decrement. It won't. |
| D8 | **Logging a future date is refused for all activity types.** Date pickers have `max = today`. | A future weigh-in or a pre-completed workout is meaningless and is usually clock skew or a mis-tap. | Allowing future logs "for flexibility" → charts with points past today, week actuals > planned. |
| D9 | **Backfilling past dates is allowed without limit, but only counts from `goal.startDate`.** | §12 tracking is retrospective by nature (you weigh yourself, then open the app). | Refusing backfill → users fabricate today's data to record yesterday's. |
| D10 | **Deadline is `{ precision: 'day' \| 'month', value: string }`. Month precision resolves to the *last day* of that month for all math; UI renders "March 2027".** | §2 literally specifies "Deadline: March 2027". Resolving late is generous and matches user intent ("by the end of March"). | Storing a fake `2027-03-01` date → silently loses a month of runway and displays "1 March 2027" the user never typed. |
| D11 | **Weeks are grouped in the Plan screen by the month of their `weekStart`, and every week is always labelled with its full range ("Sep 28 – Oct 4").** | Deterministic, each week appears exactly once (§10 groups by month), and the range label removes all ambiguity for straddling weeks. | ISO-8601 Thursday rule → "Week of Sep 28" filed under October surprises every user. |
| D12 | **Merge rule on re-plan: weeks before the current week are frozen; future weeks with `userEdited === true` are kept verbatim and their work is subtracted from the redistribution pool; non-edited future weeks are regenerated; weeks past a shortened deadline are deleted only if not user-edited (else flagged `orphaned`).** | §4 "the user must be able to edit the generated plan" + §5 "the user must always have control" means manual edits outrank the generator, always. | Regenerating everything → the user's hand-tuned week silently vanishes; they stop trusting the app. |
| D13 | **Pause never counts against the user.** Weeks inside a pause interval get `status:'paused'`, are excluded from adherence numerators *and* denominators, from streak-ish copy, and from redistribution elasticity. Pending tasks inside the pause window are deleted, not "missed". | §5 explicitly forbids failure framing. A paused goal produced no plan, so it can produce no miss. | Counting paused weeks as missed → a 6-week illness reads as 18 failures on return. |
| D14 | **Weekly plans materialize lazily in a rolling 8-week window; daily tasks in a 14-day window. Beyond that, weeks are computed on demand from `goal.planSpec` and only written when edited.** | A 10-year goal is 520 weeks × 5 tasks/week = 2600 rows per goal of pure noise. §14/§18 demand a fast local app. | Materializing the whole horizon at creation → slow create, huge exports, and every re-plan rewrites thousands of rows. |
| D15 | **IndexedDB failure never yields a white screen.** A boot probe classifies the failure and renders `StorageGate`, offering an explicit, banner-marked **ephemeral memory mode** with Export enabled. | iOS private browsing / Lockdown / blocked storage are real and common on the exact platform this PWA targets (§18). | Silent `localStorage` fallback → different quota, different semantics, silent data loss at 5 MB. |
| D16 | **An older bundle must never write to a newer DB.** If `db.version > APP_SCHEMA_VERSION`, the app goes read-only and shows "This tab is out of date — Reload". Service worker is network-first for the HTML shell and never auto-`skipWaiting`. | The stale-SW-vs-new-schema deadlock is the standard PWA data-loss incident. | Auto `skipWaiting` + cache-first HTML → an old tab writing rows the new schema can't read. |
| D17 | **Destructive actions get *either* a confirm dialog *or* an undo, chosen by reversibility — plus a 30-day `trash` store for goal deletion.** See §H matrix. | §17 "fast to use": confirming every tap is hostile; confirming nothing is negligent. | Confirm-everything, or trust-everything. |
| D18 | **Deterministic record ids for generated rows: `WeeklyPlan.id = \`${goalId}:${weekStart}\``, `DailyTask.id = \`${goalId}:${date}:${slotKey}\``.** | Makes materialization idempotent across two tabs, re-plans, and import merges — `put` can never create a duplicate week. | Random UUIDs for generated rows → duplicate weeks after a double-boot race, visible as doubled targets. |
| D19 | **No validation library. Hand-written type guards (`src/data/validate.ts`, per DATA-MODEL.md §5.5) serve both import validation (§15) and DB read guards.** | Keeps the runtime dependency budget at the cap ARCHITECTURE.md sets (§1.1); the shape-check surface is ~8 entity types and is fully unit-testable with 100% coverage, which a library doesn't buy on top of. | `zod` — real per-row error paths still require hand-written referential/cross-reference checks on top regardless of library choice, so the library's marginal value is smaller than it first looks. |
| D20 | **"Missed" is never rendered in red and never uses failure language.** Missed chip: `#F1F5F9` bg / `#475569` text. Copy is always "You completed 1 of 3 planned workouts" (§5, verbatim). | §17 forbids shaming/gamification patterns; red is a failure signal. | Red "MISSED" badges → exactly the tone the spec rules out. |
| D21 | **Numeric entry uses `type="text" inputmode="decimal"` with a `parseDecimal()` that accepts `.` and `,`.** | `parseFloat("43,5") === 43`. On a European locale phone this silently records 43 kg instead of 43.5 kg. | `type="number"` → locale-dependent silent truncation. |
| D22 | **All progress fractions are clamped to `[0,1]` for bars but the unclamped signed value is kept for charts and copy.** Moving away from target shows 0% + a factual delta, never a negative bar. | §13/§5: communicate quickly, factually, without failure framing. | Unclamped → `-40%` bars and NaN when `target === start`. |

---

## 1. Where correctness is enforced (layer map)

Invariants are enforced at the **lowest layer that can see the violation**, and re-asserted in the diagnostic pass. UI validation is a convenience, never the guarantee.

```
src/
  lib/
    date/civil.ts            EC-T01..T09   pure civil-date arithmetic (no Date math elsewhere)
    time/useToday.ts         EC-T10..T12   rollover ticker, single source of `today`
    time/clockGuard.ts       EC-T13..T14   skew detection (advisory, non-blocking)
    num/parseDecimal.ts      EC-M09        locale-safe numeric input
    num/round.ts             EC-P07        roundTo / nearlyEqual (float traps)
    id.ts                    EC-S09        crypto.randomUUID + iOS<15.4 fallback
  domain/
    units.ts                 EC-M06..M08   canonical <-> display, never mutates stored data
    tasks/status.ts          EC-K01..K04   derived status + week tally
    progress/metric.ts       EC-P02..P05   direction, div-by-zero, clamping
    planner/spec.ts          EC-P01..P09   feasibility + allocation
    planner/materialize.ts   EC-P10        lazy window
    planner/replan.ts        EC-L02..L04   merge rule (pure diff, applied separately)
    goal/lifecycle.ts        EC-L01..L09   pause/archive/delete/cascade
    validate/invariants.ts   ALL           validateDb() diagnostic, run on demand + post-import
  data/
    db.ts                    EC-S01..S06   open, probe, withTx, error classification
    migrations/index.ts      EC-S07..S08   versioned, transactional, fixture-tested
    sync/tabs.ts             EC-S10        BroadcastChannel invalidation + versionchange
    repo/*.ts                write-path guards; the ONLY place that touches IDB stores
  features/
    dataio/importValidate.ts EC-I01..I09
    dataio/importApply.ts    EC-I10..I12
  app/
    boot/StorageGate.tsx     EC-S01..S03   the no-white-screen boundary
    providers/TodayProvider  EC-T10
```

**Rule:** `src/features/**` and `src/app/**` may not import `idb` primitives or construct `Date`. Enforced with `eslint no-restricted-imports` + `no-restricted-syntax`:

```jsonc
// .eslintrc.cjs (excerpt)
"no-restricted-syntax": [
  "error",
  { "selector": "NewExpression[callee.name='Date'][arguments.length=0]",
    "message": "Use useToday()/todayKey(now) from src/lib/time — see EC-T10." }
]
// overrides: files ["src/lib/time/**", "src/lib/date/**"] -> rule off
```

---

## A. Time and calendar

### A.1 The primitive layer

*DATA-MODEL.md §2 is the authoritative, merged version of this module — it now includes the DST test cases and function names below. Treat DATA-MODEL.md as the source of truth for the exact exported function list; the code here is preserved for the DST/leap-year reasoning that motivated it.*

```ts
// src/lib/date/civil.ts
export type LocalDate  = string & { readonly __k: 'LocalDate' };  // 'YYYY-MM-DD'
export type MonthKey = string & { readonly __k: 'MonthKey' }; // 'YYYY-MM'
export type WeekKey  = LocalDate;                               // the week's first day

const MS_DAY = 86_400_000;

export function parseKey(k: LocalDate): { y: number; m: number; d: number };
export function asLocalDate(s: string): LocalDate;          // throws on malformed / impossible dates
export function isLocalDate(s: unknown): s is LocalDate;    // /^\d{4}-\d{2}-\d{2}$/ AND round-trips

/** LOCAL wall-clock date of `now`. The only bridge from instant -> civil date. */
export function toLocalDate(now: Date): LocalDate;
export function todayKey(now: Date): LocalDate;           // = toLocalDate(now)

export function addDays(k: LocalDate, n: number): LocalDate;
export function addWeeks(k: LocalDate, n: number): LocalDate;
/** Clamps to the last valid day: 2027-01-31 +1m => 2027-02-28; 2028-01-31 +1m => 2028-02-29. */
export function addMonthsClamped(k: LocalDate, n: number): LocalDate;
export function diffDays(a: LocalDate, b: LocalDate): number;   // a - b, exact whole days
export function startOfWeek(k: LocalDate, weekStartsOn: 0 | 1): WeekKey;
export function weeksBetween(a: WeekKey, b: WeekKey): number; // exact; assumes both are week starts
export function monthOf(k: LocalDate): MonthKey;
export function firstDayOfMonth(m: MonthKey): LocalDate;
export function lastDayOfMonth(m: MonthKey): LocalDate;    // leap-aware
export function daysInMonth(y: number, m: number): number;
export function isLeapYear(y: number): boolean;          // y%4===0 && (y%100!==0 || y%400===0)
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[]; // inclusive, throws if to<from
export function clampDate(k: LocalDate, min: LocalDate, max: LocalDate): LocalDate;
```

Reference implementation of the two load-bearing functions:

```ts
function toUTC(k: LocalDate): number {
  const { y, m, d } = parseKey(k);
  return Date.UTC(y, m - 1, d);
}
function fromUTC(ms: number): LocalDate {
  const dt = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(dt.getUTCFullYear(), 4)}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}` as LocalDate;
}
export function addDays(k: LocalDate, n: number): LocalDate { return fromUTC(toUTC(k) + n * MS_DAY); }
export function diffDays(a: LocalDate, b: LocalDate): number { return Math.round((toUTC(a) - toUTC(b)) / MS_DAY); }

export function toLocalDate(now: Date): LocalDate {   // LOCAL getters, deliberately
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(now.getFullYear(), 4)}-${p(now.getMonth() + 1)}-${p(now.getDate())}` as LocalDate;
}

export function startOfWeek(k: LocalDate, weekStartsOn: 0 | 1): WeekKey {
  const dow = new Date(toUTC(k)).getUTCDay();        // 0=Sun .. 6=Sat
  return addDays(k, -(((dow - weekStartsOn) + 7) % 7)) as WeekKey;
}
```

`Date.UTC` is used purely as a proleptic-Gregorian day counter. It has no DST, so `+n*MS_DAY` is exactly `n` civil days for every `n`, in every timezone, across every transition. `toLocalDate` is the single place that reads local calendar fields.

### A.2 Cases

| ID | Trigger | Naive failure | Decided handling | Enforced in |
|---|---|---|---|---|
| **EC-T01** | User flies Tokyo → Los Angeles mid-plan. | Logs stored as UTC instants shift a day; Friday's workout appears on Thursday; a week's actuals change retroactively. | `LocalDate` is captured once at log time and is immutable. Travel changes *which day is "today"*, never which day a past record belongs to. Zero migration, zero recompute. | D1; `repo/entries.ts` sets `date` from `todayKey(now)` at write; nothing ever recomputes it. |
| **EC-T02** | DST spring-forward, e.g. US **2027-03-14** or EU **2027-03-28** (both inside the 43→50 kg plan window). The day is 23 h. | `startOfDay + 24h` lands at 23:00 the same day → an infinite/duplicated day in `eachDay`, and a week of 6 days. | All arithmetic is UTC-integer (D2). `eachDay(2027-03-13, 2027-03-15)` returns exactly 3 keys. Week `2027-03-08..2027-03-14` contains exactly 7 keys. | `civil.ts`; unit test `civil.dst.test.ts`. |
| **EC-T03** | DST fall-back, EU **2026-10-25** / US **2026-11-01**. The day is 25 h. | `msUntilNextLocalMidnight` computed as `86_400_000 - elapsed` fires one hour early → Today screen flips to tomorrow at 23:00. | `msUntilNextLocalMidnight` constructs the next local midnight with the **local Date constructor** (`new Date(y, m, d+1)`), which the engine resolves correctly for 23 h/25 h days. The ticker also re-derives the key rather than assuming a flip. | `src/lib/time/useToday.ts`. |
| **EC-T04** | App left open across midnight (very common: phone on the nightstand, PWA resumed at 07:00). | §7 Today screen shows yesterday's tasks; a one-tap complete writes to the wrong day. | `useToday()` self-rescheduling ticker + `visibilitychange`/`focus`/`pageshow` + 15-min ceiling. On change: `setToday`, invalidate all day/week selectors, run `ensureMaterialized()` for active goals. No component holds its own date (D3). | `useToday.ts`, `TodayProvider.tsx`. |
| **EC-T05** | Device clock set backwards (manual change, bad NTP, factory reset). | `today < maxObservedDayKey`; already-completed tasks re-appear as pending "in the future"; week actuals appear to shrink. | Non-blocking amber banner "Your device date looks wrong (shows 2026-09-14; last used 2026-09-19). Check your clock." The app keeps working; writes still use the device date. Nothing is auto-corrected. | `clockGuard.ts` + `ClockBanner`. |
| **EC-T06** | Clock jumps far forward (dead battery, wrong year like 2036). | The planner reports thousands of missed weeks; the goal looks catastrophically failed. | Same advisory banner when `diffDays(today, maxObservedDayKey) > 60`. Additionally, **missed-count copy caps at the plan window**: "no activity since Sep 19" rather than "142 missed tasks". Materialization is capped (D14) so no row explosion. | `clockGuard.ts`, `tallyWeek` cap, `materialize.ts`. |
| **EC-T07** | Week boundary. User's mental week is Mon–Sun; some users want Sun–Sat. | Hard-coded `getDay()===0` logic; off-by-one on Sundays. | `settings.weekStartsOn: 0 | 1`, default **1 (Monday)**. Every week computation takes it as a parameter — no module-level default. Changing it **does not rewrite history**: existing `WeeklyPlan.weekStart` rows keep their key and are shown with their stored range; a warning explains that past weeks keep their original boundaries and offers "Re-plan future weeks". | `startOfWeek(k, weekStartsOn)`; `settings.repo` change handler. |
| **EC-T08** | **First partial week.** Goal created Sat **2026-09-19**; its week began Mon 2026-09-14, so only 2 days remain. | A full 3-workout target is assigned to a 2-day stub → instant "behind". | The first week's target is prorated by *remaining available slots*, not calendar days: `target₀ = clamp(round(weeklyTarget × availableSlotsRemaining / availableSlotsPerWeek), 0, weeklyTarget)`. With 3 sessions/wk on 5 available days and 2 days left: `round(3×2/5)=1`. If `target₀ === 0`, the week is created with `status:'active', targets:[]` and rendered "Plan starts Mon Sep 21". | `planner/spec.ts → prorateFirstWeek()`. |
| **EC-T09** | **Last partial week.** Deadline March 2027 → 2027-03-31 (Wed). Final week starts Mon 2027-03-29 → 3 days. | A full week's work is demanded in 3 days, or the last 3 days are dropped and the plan under-delivers the target. | Same proration, and the leftover from proration is pushed back into the *preceding* elastic weeks by the largest-remainder allocator so the total still sums to the required work. If that would push any week above `maxPerWeek`, the feasibility result becomes `TIGHT` and the wizard offers "Extend to Apr 2027". | `planner/spec.ts → allocate()`. |
| **EC-T10** | A week straddles two months: **Sep 28 – Oct 4 2026**. §10 groups by month. | The week is listed twice (under both months), or vanishes from one. | D11: grouped by `monthOf(weekStart)` → September. Header renders `Week of Sep 28 – Oct 4`. A month group is rendered even if it contains 0 weeks only when it lies strictly inside the plan window (otherwise omitted). | `features/plan/groupByMonth.ts`. |
| **EC-T11** | Leap day **2028-02-29** (a Tuesday) inside a long horizon. | `addMonthsClamped('2028-01-31', 1)` returning an invalid `2028-02-31`; `new Date('2028-02-31')` silently becomes Mar 2. | `addMonthsClamped` clamps via `Math.min(d, daysInMonth(y, m))`. `asLocalDate` rejects any string that does not round-trip, so an invalid date can never enter the DB or an import. | `civil.ts`; the hand-written `isLocalDate` guard used by `validate.ts` (DATA-MODEL.md §5.5). |
| **EC-T12** | Deadline "**March 2027**" (month precision, §2) vs an exact date. | Stored as `2027-03-01`, losing 30 days of runway; displayed as a date the user never entered. | `Deadline = { precision:'month', value:'2027-03' } \| { precision:'day', value: LocalDate }`. `resolveDeadline()` → `2027-03-31`. UI renders "March 2027" for month precision, formatted date otherwise. Never denormalized into a second field. | `domain/goal/deadline.ts`. |
| **EC-T13** | Two goals with different `startDate`s share the Today screen across a rollover. | Partial re-render; one card updates, another doesn't. | A single `today` value in context → one re-render, all consumers consistent. | D3. |
| **EC-T14** | Exported backup opened on a device in another timezone. | Dates re-parsed as instants shift by a day. | Export writes `LocalDate` strings verbatim (no `toISOString()` anywhere in the export path). Import reads them verbatim. Round-trip is byte-identical. | `dataio/export.ts` — forbidden token check in CI: `grep -r "toISOString" src/features/dataio` must be empty. |

```ts
// src/lib/time/useToday.ts
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1_000, next.getTime() - now.getTime());
}

const MAX_TICK = 15 * 60_000;   // background-throttling + device-sleep resilience

export function useToday(): LocalDate {
  const [key, setKey] = useState(() => todayKey(new Date()));
  useEffect(() => {
    let t: number;
    const sync = () => { const k = todayKey(new Date()); setKey(p => (p === k ? p : k)); };
    const schedule = () => {
      const wait = Math.min(msUntilNextLocalMidnight(new Date()) + 1_000, MAX_TICK);
      t = window.setTimeout(() => { sync(); schedule(); }, wait);
    };
    schedule();
    const on = () => { sync(); window.clearTimeout(t); schedule(); };
    document.addEventListener('visibilitychange', on);
    window.addEventListener('focus', on);
    window.addEventListener('pageshow', on);
    return () => { window.clearTimeout(t); document.removeEventListener('visibilitychange', on);
                   window.removeEventListener('focus', on); window.removeEventListener('pageshow', on); };
  }, []);
  return key;
}
```

```ts
// src/lib/time/clockGuard.ts
export interface ClockState { maxObservedDayKey: LocalDate; lastSeenEpochMs: number; }
export type ClockAnomaly =
  | { kind: 'none' }
  | { kind: 'moved-backwards'; observed: LocalDate; previousMax: LocalDate }
  | { kind: 'large-jump-forward'; days: number; previousMax: LocalDate };

export const FORWARD_JUMP_DAYS = 60;

export function checkClock(now: Date, s: ClockState): ClockAnomaly {
  const t = todayKey(now);
  if (t < s.maxObservedDayKey) return { kind: 'moved-backwards', observed: t, previousMax: s.maxObservedDayKey };
  const d = diffDays(t, s.maxObservedDayKey);
  if (d > FORWARD_JUMP_DAYS) return { kind: 'large-jump-forward', days: d, previousMax: s.maxObservedDayKey };
  return { kind: 'none' };
}
```

Clock banner (amber `#FFFBEB` bg / `#FDE68A` border / `#78350F` text):

```
┌──────────────────────────────────────────────────┐
│ ⚠  Your device date may be wrong                 │
│    Today reads Sep 14 2026, but you last used    │
│    the app on Sep 19 2026.                       │
│    New entries will be saved with the date your  │
│    device reports.            [Dismiss]          │
└──────────────────────────────────────────────────┘
```

---

## B. Goal lifecycle

### B.1 Relevant fields

```ts
// src/domain/goal/types.ts  (edge-case-relevant subset; data-model dimension owns the full shape)
export type GoalStatus = 'active' | 'paused' | 'archived';

export interface PauseInterval { from: LocalDate; to: LocalDate | null; }  // inclusive both ends

export interface Goal {
  id: string;
  status: GoalStatus;
  startDate: LocalDate;
  deadline: Deadline;
  pauses: PauseInterval[];      // ordered, non-overlapping; invariant INV-G3
  planSpec: PlanSpec;           // the small deterministic record weeks are generated from
  createdAt: number; updatedAt: number;
}

export interface WeeklyPlan {
  id: string;                   // `${goalId}:${weekStart}`  (D18)
  goalId: string;
  weekStart: WeekKey;
  targets: WeekTarget[];        // { activityId: string; quantity: number; unit: CanonicalUnit }
  source: 'generated' | 'user';
  userEdited: boolean;          // set true on ANY manual target change; never cleared automatically
  editedAt?: number;
  specVersion: number;          // planSpec.version this was generated from
  status: 'active' | 'paused' | 'orphaned';
  createdAt: number; updatedAt: number;
}
```

`userEdited` is set by exactly one function and cleared by exactly one user action:

```ts
// src/domain/planner/replan.ts
export function markUserEdited(w: WeeklyPlan, targets: WeekTarget[], now: number): WeeklyPlan;
/** The ONLY way back to generated: an explicit "Reset this week to suggested" button. */
export function resetToGenerated(w: WeeklyPlan, spec: PlanSpec, now: number): WeeklyPlan;
```

### B.2 The merge rule (exact, EC-L02)

```ts
export interface ReplanInput {
  goal: Goal;                 // already carrying the NEW deadline / NEW planSpec
  existing: WeeklyPlan[];     // all persisted weeks for this goal
  today: LocalDate;
  weekStartsOn: 0 | 1;
  doneByWeek: Record<WeekKey, Record<string /*activityId*/, number>>; // derived actuals
}

export interface ReplanDiff {
  frozen:   WeeklyPlan[];                                 // weekStart < currentWeek — untouched
  kept:     WeeklyPlan[];                                 // future & userEdited
  replaced: Array<{ before: WeeklyPlan; after: WeeklyPlan }>;
  created:  WeeklyPlan[];
  deleted:  string[];                                     // ids of generated weeks outside new window
  orphaned: string[];                                     // ids of userEdited weeks outside new window
  feasibility: Feasibility;
}

export function planReplan(input: ReplanInput): ReplanDiff;           // pure
export async function applyReplan(goalId: string, diff: ReplanDiff): Promise<void>; // one IDB tx
```

Algorithm, with `cw = startOfWeek(today, weekStartsOn)` and `dw = startOfWeek(resolveDeadline(goal.deadline), weekStartsOn)`:

1. `weekStart < cw` → **frozen**. Never modified, never deleted, even if the deadline moved earlier. History is a record, not a plan (§5).
2. `cw <= weekStart <= dw`:
   - `userEdited === true` → **kept verbatim**. Its `quantity` per activity is subtracted from the remaining pool.
   - inside a pause interval → `status:'paused'`, targets emptied, **excluded from the elastic set** (D13).
   - else → **replaced** with freshly allocated targets, `specVersion = spec.version`.
3. `weekStart > dw` (deadline moved earlier):
   - `userEdited === false` → **deleted**, together with that week's `pending` tasks. `done`/`skipped` tasks survive with `weeklyPlanId = null`.
   - `userEdited === true` → `status:'orphaned'`, **kept**. Rendered in Plan under "Outside plan window" with `[Move]` / `[Delete]`.
4. Missing weeks in `[cw..min(dw, cw + MAX_MATERIALIZED_WEEKS - 1)]` → **created**. Weeks beyond the materialization window are left virtual (D14).

Remaining-work pool and allocation:

```
totalWork(activity)   = spec.totalQuantity[activity]
doneBefore(activity)  = Σ doneByWeek[w][activity] for all w < cw
committed(activity)   = Σ kept[w].targets[activity]                      // userEdited future weeks
remaining(activity)   = max(0, totalWork − doneBefore − committed)
elastic              = weeks in [cw..dw] that are neither userEdited nor paused
perWeek              = elastic.length === 0 ? 0 : remaining / elastic.length
```

Integer allocation uses **largest remainder** so the parts sum exactly to `remaining`, with earliest-week tie-break (deterministic):

```ts
// src/domain/planner/allocate.ts
export function allocateLargestRemainder(total: number, weights: number[]): number[];
// weights = per-week available-slot weights (1 for full weeks, fractional for partial first/last weeks)
// Post-condition (asserted in dev): result.reduce(add,0) === total
```

**Current-week floor (EC-L03):** re-planning must never set a target below what is already achieved this week.

```
target_cw(activity) = max(allocated_cw(activity), doneByWeek[cw][activity] ?? 0)
```
Any excess created by this floor is removed from the *last* elastic week first (never from the current one), and if that drives the last week negative the feasibility flag becomes `TIGHT`.

### B.3 Cases

| ID | Trigger | Naive failure | Decided handling | Enforced in |
|---|---|---|---|---|
| **EC-L01** | Goal created with a deadline already in the past. | `weeksBetween` returns 0 or negative → division by zero → `Infinity`/`NaN` targets, or an empty screen with no explanation. | Creation is **allowed** (a user may be recording a finished goal), but the wizard shows an inline caution and a one-tap fix "Set deadline to +12 weeks". The planner returns `{ weeks: [], feasibility: { code: 'DEADLINE_IN_PAST' } }`; the Plan screen renders an explainer + `[Change deadline]` CTA, not an empty list. | `planner/spec.ts` guard; `GoalWizard` inline hint. |
| **EC-L02** | Deadline edited later or earlier while plans exist. | Everything regenerated → the user's hand-edited week is gone. | D12 merge rule above. A **preview sheet** shows the diff before anything is written; nothing is applied without pressing Apply. | `planReplan` (pure) + `applyReplan` (single tx). |
| **EC-L03** | Deadline shortened mid-week when 2 of 3 workouts are already done and the new allocation says 1. | The week shows "2 / 1" and the progress bar reads 200%, or the target shrinks and the 2nd workout looks like an error. | Current-week floor above → target stays ≥ 2. If actual still exceeds target later, UI renders "3 of 2 · ahead" with the bar clamped at 100% (D22), never an error. | `planReplan`; `weekBand()`. |
| **EC-L04** | Deadline moved *later* → more weeks than the materialization window. | Thousands of rows written. | Only `MAX_MATERIALIZED_WEEKS` are written; the rest are virtual and rendered from `planSpec` (D14). The Plan screen can still scroll the whole horizon. | `materialize.ts`. |
| **EC-L05** | Goal paused for 6 weeks, then resumed. | Six weeks × 3 workouts = 18 "missed" on return. | D13. On `pauseGoal(goalId, from = today)`: set `status:'paused'`, append `{from, to:null}`, **delete pending tasks with `date >= from`**, mark weeks `>= startOfWeek(from)` as `status:'paused'` with empty targets. Adherence denominators skip them. On resume: close the interval with `to = addDays(today, -1)`, re-materialize from today, and **offer** (not force) a re-plan: "6 weeks paused. Redistribute remaining work across the 21 weeks left, or keep the original weekly targets?" | `goal/lifecycle.ts → pauseGoal/resumeGoal`; `tasks/status.ts → tallyWeek`. |
| **EC-L06** | A pause interval is opened while an earlier one is still open (double-tap on Pause, or import). | Overlapping intervals → `isPausedOn` still correct but `pauses` grows unboundedly and the UI shows nonsense. | `pauseGoal` is idempotent: if the last interval has `to === null`, return unchanged. `normalizePauses()` merges overlapping/adjacent intervals and is run on import and in `validateDb()`. Invariant **INV-G3**: intervals sorted, non-overlapping, at most one open. | `goal/lifecycle.ts`; `validate/invariants.ts`. |
| **EC-L07** | Goal archived with pending tasks. | Archived goal's tasks keep appearing on Today, or all history is deleted. | Confirm dialog with exact counts. On confirm: `status:'archived'`, delete `pending` tasks with `date >= today`, keep every past task and every measurement. Archived goals are excluded from Today/Goals (visible under More → Archived) and from all week tallies. Un-archive restores `active` and re-materializes from today. | `goal/lifecycle.ts → archiveGoal`. |
| **EC-L08** | Goal deleted with 180 measurements and 9 months of history. | Irreversible loss on a mis-tap; or orphaned rows if the cascade is partial. | **Cascade, transactional, recoverable.** One `readwrite` tx over `goals, milestones, weeklyPlans, tasks, entries, trash`: serialize the entire subtree into a single `trash` record `{ id, goalName, deletedAt, payload }`, then delete the rows. A 10-second Undo snackbar restores it; the `trash` record is retained **30 days** and purgeable from More → Recently deleted. Confirm dialog states counts ("9 months of history, 180 weight entries"). No "type the name" ceremony — bad on mobile (§17). | `goal/lifecycle.ts → deleteGoal`; `repo/trash.ts`. |
| **EC-L09** | Milestone deleted mid-plan while tasks reference it. | Cascade deletes the user's completed practice history; or dangling `milestoneId`. | **SET NULL, not cascade.** `tasks.milestoneId → null`; weekly targets keyed by `activityId` are unaffected. The confirm dialog offers an opt-in checkbox "Also delete this milestone's 12 pending tasks" (default **off**; only ever offers `pending` ones). | `goal/lifecycle.ts → deleteMilestone`; INV-R2. |
| **EC-L10** | Goal `startDate` edited to a later date, after logs exist before it. | Earlier logs become invisible but still occupy storage; totals disagree with the chart. | Editing `startDate` forward shows "3 entries before the new start date will stop counting toward this goal (they are kept and still shown on the chart in grey)." Logs are never deleted. `computeProgress` filters `date >= goal.startDate`. | `progress/metric.ts`; `GoalEditForm` warning. |
| **EC-L11** | Goal deleted while its detail screen is open in another tab. | `undefined.name` crash. | Repo reads return `T \| undefined`; every detail route has a `NotFound` branch: "This goal was deleted." + `[Back to Goals]`. BroadcastChannel invalidation (EC-S10) makes the other tab navigate away within ~50 ms. | `features/goal/GoalDetailRoute.tsx`. |

Deadline-change preview sheet:

```
┌───────────────────────────────────────────────┐
│  Deadline: March 2027 → December 2026         │
│                                               │
│  Weeks before this week        13   unchanged │
│  Your edited weeks              2   kept      │
│  Suggested weeks updated       11             │
│  Weeks after the new deadline   14  removed   │
│    ↳ 1 of these you edited — kept and moved   │
│      to "Outside plan window"                 │
│                                               │
│  New weekly target: 0.45 kg/wk (was 0.25)     │
│  ⚠ Above the 0.35 kg/wk range you set.        │
│                                               │
│         [Cancel]            [Apply]           │
└───────────────────────────────────────────────┘
```

---

## C. Tracking, measurements, units

*This section's canonical/verbatim unit design and its `TrackEntry` shape are merged into DATA-MODEL.md §2/§3 as the authoritative version (`TrackEntryBase` below is that same shape, illustrated here for the edge cases that follow).*

### C.1 Units — the corruption trap (D6)

```ts
// src/domain/units.ts
export type CanonicalUnit = 'kg' | 'km' | 'min' | 'count';
export type DisplayUnit   = 'kg' | 'lb' | 'km' | 'mi' | 'min' | 'h' | 'count';

export const UNIT_TABLE: Record<DisplayUnit, { canonical: CanonicalUnit; factor: number; dp: number }> = {
  kg:    { canonical: 'kg',    factor: 1,           dp: 1 },
  lb:    { canonical: 'kg',    factor: 0.45359237,  dp: 1 },   // exact by definition
  km:    { canonical: 'km',    factor: 1,           dp: 2 },
  mi:    { canonical: 'km',    factor: 1.609344,    dp: 2 },   // exact by definition
  min:   { canonical: 'min',   factor: 1,           dp: 0 },
  h:     { canonical: 'min',   factor: 60,          dp: 0 },
  count: { canonical: 'count', factor: 1,           dp: 0 },
};

export function toCanonical(value: number, unit: DisplayUnit): number;   // roundTo(value * factor, 6)
export function fromCanonical(value: number, unit: DisplayUnit): number; // value / factor
export function formatMeasure(m: TrackEntryBase, display: DisplayUnit): string;
export function compatible(a: DisplayUnit, b: DisplayUnit): boolean;     // same canonical
```

```ts
export interface TrackEntryBase {
  id: string;
  goalId: string;
  activityId: string;
  date: LocalDate;               // civil date of the OBSERVATION (D1)
  loggedAt: number;            // epoch ms, ordering/tie-break only
  value: number;               // CANONICAL, roundTo(_, 6)
  canonicalUnit: CanonicalUnit;
  entry: { value: number; unit: DisplayUnit };  // verbatim user input — lossless display
  note?: string;
  updatedAt: number;
}
```

`formatMeasure` rule: **if `m.entry.unit === display`, print `m.entry.value` verbatim**; otherwise print `roundTo(fromCanonical(m.value, display), dp)`. This guarantees 43.5 kg → switch to lb → switch back → still exactly "43.5 kg", with no stored value touched.

### C.2 Cases

| ID | Trigger | Naive failure | Decided handling | Enforced in |
|---|---|---|---|---|
| **EC-M01** | Two weigh-ins on the same day (morning 43.2, evening 43.9). | Both counted as progress; the chart zig-zags; "current value" is whichever wrote last. | **Both are kept** (legitimate data, §12). The *representative value for a day* is the last by `(loggedAt, id)` descending: `dayValue(date) = latest`. The chart plots one point per day (the representative) with a "2 entries" dot affordance; the day detail lists all. `currentValue` = representative of the most recent day ≤ today. | `progress/series.ts → collapseByDay()`. |
| **EC-M02** | Double-tap on the habit "Workout ✓" button. | Two habit logs for the same day → "4 / 3 workouts". | Habit/session/duration logs carry a **unique compound key** `(goalId, activityId, date)` as an IDB `unique` index; `logHabit` is an idempotent upsert. Plus a 400 ms UI lockout after the first tap and optimistic state, so the second tap is a visual no-op. | IDB index `by_goal_activity_date` (unique); `repo/logs.ts → upsertHabitLog`. |
| **EC-M03** | User edits a log from 3 weeks ago (43.2 → 42.9) or deletes it. | Persisted week actuals and goal progress are now stale; the chart and the number disagree. | D7 — nothing is persisted. `computeWeekActuals`, `metricProgress`, and every chart series are pure functions of the log set, recomputed on read. Edit/delete simply mutates one row and publishes an invalidation. | `progress/*`, `tasks/status.ts`; no aggregate columns exist to go stale. |
| **EC-M04** | Backfilling last Tuesday's workout on Friday. | Refused, or recorded as Friday. | Allowed (D9). The log's `date` is the picked date; `loggedAt` is now. Week actuals bucket by `date`, never by `loggedAt`. Backfilling into an earlier week retro-changes that week's actuals — correct, and visible immediately because actuals are derived. | `repo/logs.ts`; `validateLog`. |
| **EC-M05** | Backfilling to a date before `goal.startDate`. | Counted, so the goal shows progress before it existed; or silently dropped. | Allowed to be stored, **not counted**. Inline notice: "Sep 1 is before this goal started (Sep 19). It will be saved but won't count toward weekly targets." Offer `[Move goal start to Sep 1]`. | `validateLog` (warning, not error); `computeProgress` filter. |
| **EC-M06** | Picking a future date in the log sheet. | Charts with points past today; week actuals exceed planned. | **Refused** (D8). Date picker `max = today`; `validateLog` returns `{ code:'FUTURE_DATE' }` and the sheet shows "You can't log a future date." Same rule for task completion (EC-K03). | `validateLog()`; `<DatePicker max={today}>`. |
| **EC-M07** | Weight moves away from target (43.5 → 42.8 on a 43→50 goal). | Negative progress bar, "-10%", or red "you failed" framing. | `metricProgress` clamps the bar to 0 and reports `state:'regressed'`. Copy: "42.8 kg · 0.7 kg below your starting point" — factual, neutral colour `#475569` (D20, §5). The chart shows the true dip. Weekly band ignores metric direction entirely and is computed only from *actions* (sessions logged), because weight is not under direct weekly control (§4 "avoid presenting uncertain real-world progress as exact predictions"). | `progress/metric.ts`; `weekBand()` uses habit actuals only. |
| **EC-M08** | User switches kg → lb in settings with 180 stored measurements. | Convert-on-switch: a half-failed loop leaves mixed units; repeated round-trips accumulate float error; a crash mid-way is unrecoverable. | **Display-only** (D6). `settings.displayUnits.mass = 'lb'`. Zero writes. Zero risk. Charts re-label their axis; entered values keep their verbatim rendering per EC-M08a. | `units.ts`; there is no `convertAllEntries` function, by design. |
| **EC-M08a** | User enters 95 lb while the goal target is in kg. | Stored as 95 kg. | `logEntry` always converts through `toCanonical(entry.value, entry.unit)`. The entry unit is chosen in the sheet and defaults to the current display unit. `compatible()` blocks logging `min` into a mass activity. | `repo/logs.ts`; `validateLog`. |
| **EC-M09** | European-locale phone, user types `43,5`. | `parseFloat('43,5') === 43` → 43 kg recorded silently. | D21: `type="text" inputmode="decimal"`, `parseDecimal(s)` normalises `,`→`.`, strips spaces and thousands separators, rejects multiple separators, returns `number \| null`. Empty/invalid disables Save. | `src/lib/num/parseDecimal.ts`. |
| **EC-M10** | User enters 4300 kg (typo) or -5. | Stored; the chart's y-axis collapses; progress reads 100%. | Soft sanity bounds per canonical unit (`kg: 1..640`, `km: 0..1000`, `min: 0..1440`, `count: 0..1000`). Out of range → a confirm step "4300 kg — is that right?" with `[Fix]` / `[Save anyway]`. Negative values are hard-rejected for all canonical units. Charts additionally clip the y-domain to p1..p99 with an "outlier" marker. | `validateLog()` bounds table; `progress/series.ts` domain. |
| **EC-M11** | Duration activity: 90 min entered as `1.5 h`. | Float drift (`1.5*60 = 90.00000000000001` in some chains). | `toCanonical` applies `roundTo(v, 6)`; `min`/`count` additionally `Math.round`. `nearlyEqual(a,b,1e-6)` is used for every value comparison in the app; `===` on floats is banned by review checklist. | `lib/num/round.ts`. |
| **EC-M12** | An entry exists for an activity that was deleted from the goal. | Crash on `activities[m.activityId].unit`. | Activity deletion sets `activity.status='retired'` instead of removing it, so historical logs always resolve. Retired activities are hidden from logging UI and from week targets. Hard delete is only available when the activity has zero logs. | `goal/lifecycle.ts → retireActivity`; INV-R3. |

---

## D. Tasks

### D.1 State model (D4/D5)

```ts
// src/domain/tasks/status.ts
export type StoredTaskStatus  = 'pending' | 'done' | 'skipped';
export type DisplayTaskStatus = StoredTaskStatus | 'missed';

export interface DailyTask {
  id: string;                 // `${goalId}:${date}:${slotKey}` for generated tasks (D18)
  goalId: string;
  milestoneId: string | null; // SET NULL on milestone delete (EC-L09)
  weeklyPlanId: string | null;
  activityId: string | null;   // which weekly target this satisfies
  date: LocalDate;              // the day the task is FOR
  title: string;
  durationMin?: number;
  status: StoredTaskStatus;
  completedAt?: number;       // epoch ms of the tap — NOT used for bucketing
  skippedReason?: string;
  source: 'generated' | 'user';
  userEdited: boolean;
  createdAt: number; updatedAt: number;
}

export function displayStatus(
  task: Pick<DailyTask, 'date' | 'status'>,
  today: LocalDate,
  isPausedOn: (d: LocalDate) => boolean,
): DisplayTaskStatus {
  if (task.status !== 'pending') return task.status;
  if (task.date >= today) return 'pending';
  if (isPausedOn(task.date)) return 'pending';   // D13: a paused day can never be missed
  return 'missed';
}
```

Semantics, fixed:

| State | Meaning | Numerator | Denominator | Chip |
|---|---|---|---|---|
| `pending` | Today or future; not yet acted on | no | no | `#F8FAFC` bg, `#334155` text |
| `done` | User completed it | **yes** | **yes** | `#ECFDF5` bg, `#065F46` text |
| `skipped` | User deliberately declined it | no | **no** | `#F8FAFC` bg, `#64748B` text, dashed `#CBD5E1` border |
| `missed` *(derived)* | Past, never acted on, goal not paused | no | **yes** | `#F1F5F9` bg, `#475569` text — **never red** (D20) |

```ts
export interface WeekTally { done: number; skipped: number; missed: number; pending: number; planned: number; }
export function tallyWeek(tasks: DailyTask[], today: LocalDate, isPausedOn: (d: LocalDate) => boolean): WeekTally;

/** null when the denominator is 0 — render "—", never 0% or NaN%. */
export function adherence(t: WeekTally): number | null {
  const d = t.done + t.missed;
  return d === 0 ? null : t.done / d;
}

export type WeekBand = 'ahead' | 'on-track' | 'behind' | 'no-data';
/** Time-prorated: compares against slots that have ALREADY elapsed, not the whole week. */
export function weekBand(doneSoFar: number, elapsedSlots: number, weekTarget: number): WeekBand {
  if (weekTarget <= 0 || elapsedSlots <= 0) return 'no-data';
  const expected = Math.min(weekTarget, elapsedSlots);
  const r = doneSoFar / expected;
  if (r >= 1.15) return 'ahead';
  if (r >= 0.85) return 'on-track';
  return 'behind';
}
```

`elapsedSlots` = number of planned task slots in this week with `date <= today`. On Monday morning with a Tue/Thu/Sat plan, `elapsedSlots === 0` → `'no-data'` → §9's badge renders "—", never "Behind". This is the trap: a naive `done/target` marks every user "Behind" on Monday.

### D.2 Cases

| ID | Trigger | Naive failure | Decided handling | Enforced in |
|---|---|---|---|---|
| **EC-K01** | Task completed twice (double-tap; or tapped in two tabs). | Two completion events → "4 / 3". | `completeTask` is idempotent: if `status === 'done'`, return the row unchanged (no `updatedAt` bump, no broadcast). Counting is over *rows*, never events, so re-completion is arithmetically impossible. 400 ms UI lockout + optimistic state for feel. | `repo/tasks.ts → completeTask`. |
| **EC-K02** | Task un-completed (user taps a done task). | Ambiguous: does it become pending or missed? | Returns to `status:'pending'`, `completedAt` cleared. If its date is in the past, `displayStatus` then derives `missed` — correct and automatic. | `displayStatus`. |
| **EC-K03** | Completing a task dated in the past (yesterday's workout, ticked this morning). | `completedAt` used for bucketing → counted in the wrong week; last week's actuals never improve. | **Allowed.** `completedAt = now`, but every tally buckets by `task.date`. A 7-day grace window: tasks older than 7 days are collapsed under "Earlier" on Today with a tap-to-expand, so the list stays short (§17). | `tallyWeek` buckets by `date`; `TodayScreen` grouping. |
| **EC-K04** | Completing a task dated in the future (tomorrow's task shown on Today because of a rollover race). | Future completion → week actual > elapsed, band = "ahead" incorrectly. | **Refused** for `date > today` (D8). Today only renders `date === today` plus the "Earlier" group; future tasks are unreachable from Today by construction. Reached from the Plan screen, the tick is disabled with a tooltip "Available on Tue Sep 22". | `validateTaskAction()`; `TaskRow` disabled state. |
| **EC-K05** | Rescheduling a task to a date past the goal deadline. | Tasks exist after the goal is over; the last week's tally exceeds the plan. | **Refused** with two CTAs: `[Pick an earlier date]` / `[Extend the goal deadline]`. Hard invariant **INV-T1**: `task.date <= resolveDeadline(goal.deadline)` for every task of a non-archived goal, asserted in `validateDb()` and on import. | `validateTaskDate(task, goal)`. |
| **EC-K06** | Rescheduling a task into a past date. | Instantly "missed". | Allowed only to dates `>= today` in the reschedule sheet (`min = today`). To record something done in the past, use complete-with-backfill (EC-K03), which is a different, clearer affordance. | `<DatePicker min={today}>` in `RescheduleSheet`. |
| **EC-K07** | Tasks belonging to a paused goal. | Still on Today; accumulate as missed. | Hidden from Today, excluded from all tallies, `displayStatus` can never return `missed` for a paused day (D13). Pending tasks dated `>= pause.from` are deleted at pause time so they can't resurface on resume. | `pauseGoal`; `displayStatus`; Today query filters `goal.status === 'active'`. |
| **EC-K08** | The week's plan is edited *after* some of its tasks were completed. | Regeneration deletes completed tasks → completed work vanishes. | Regeneration touches **only `pending` tasks** of that week. `done`/`skipped` rows are never deleted or rewritten by any generator. If the new target is lower than what's already done, the week renders "3 of 2 · ahead", bar clamped (D22). | `materialize.ts → regenerateWeekTasks()` filters `status === 'pending'`. |
| **EC-K09** | Task belongs to a weekly plan that was deleted (deadline shortened). | Dangling `weeklyPlanId` → crash on join. | `weeklyPlanId` is nullable and SET NULL on plan deletion; tallies join on `(goalId, date)` → week, not on `weeklyPlanId`. The FK is a convenience only. | INV-R1; `tallyWeek` keys by date. |
| **EC-K10** | Two tabs open: tab A completes a task, tab B still shows it pending and the user taps it. | Lost update / double count. | Idempotency (EC-K01) makes the second tap a no-op even without any sync. BroadcastChannel invalidation usually updates tab B first. | `completeTask`; `sync/tabs.ts`. |
| **EC-K11** | Subtasks (§11: Breathing / Warm-up / Song practice) — parent ticked while children are pending. | Ambiguous counting; double counting the parent and its children. | Only leaf tasks carry `activityId` and count. A parent with children is a pure grouping row: ticking it completes all pending children (one tx); ticking the last child completes the parent. Parents never contribute to tallies. | `repo/tasks.ts → completeTaskCascade`; INV-T2 (`parent.activityId === null` when it has children). |
| **EC-K12** | A generated task's id collides after the user renames a slot. | `put` overwrites an unrelated task. | `slotKey` is derived from `activityId + occurrence index` and is stable under renames (the title is not part of the id). User-created tasks always use a random UUID, never the deterministic scheme. | `materialize.ts → slotKey()`. |

---

## E. Storage and runtime

### E.1 Boot sequence

```ts
// src/data/db.ts
export const DB_NAME = 'goal-planner';
export const APP_SCHEMA_VERSION = 1;

export type StorageMode = 'indexeddb' | 'memory';

export type StorageFailure =
  | { kind: 'idb-unavailable'; detail: string }                      // no window.indexedDB
  | { kind: 'idb-blocked'; detail: string }                          // open() error / SecurityError
  | { kind: 'probe-failed'; detail: string }                         // opens but can't write/read back
  | { kind: 'db-newer-than-app'; dbVersion: number; appVersion: number }
  | { kind: 'migration-failed'; from: number; to: number; detail: string };

export interface BootResult { mode: StorageMode; failure?: StorageFailure; }

export async function bootStorage(): Promise<BootResult>;
export async function withTx<T>(
  stores: readonly StoreName[], mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T>,
): Promise<T>;
export function classifyWriteError(e: unknown): 'quota' | 'blocked' | 'aborted' | 'unknown';
```

`bootStorage()` does more than `indexedDB.open` — it **round-trips a probe record**, because iOS Safari in private mode historically opens the DB successfully and then fails on write:

```ts
async function probe(db: IDBDatabase): Promise<void> {
  const token = { id: '__probe', at: Date.now() };
  await withTx(['meta'], 'readwrite', async tx => { tx.objectStore('meta').put(token); });
  const back = await withTx(['meta'], 'readonly', tx => reqToPromise(tx.objectStore('meta').get('__probe')));
  if (!back || back.at !== token.at) throw new Error('probe round-trip failed');
}
```

Quota classification (cross-browser names all matter):

```ts
export function classifyWriteError(e: unknown): 'quota' | 'blocked' | 'aborted' | 'unknown' {
  const d = e as DOMException | undefined;
  if (!d) return 'unknown';
  if (d.name === 'QuotaExceededError' || d.name === 'NS_ERROR_DOM_QUOTA_REACHED' || (d as any).code === 22)
    return 'quota';
  if (d.name === 'SecurityError' || d.name === 'InvalidStateError') return 'blocked';
  if (d.name === 'AbortError') return 'aborted';
  return 'unknown';
}
```

### E.2 Cases

| ID | Trigger | Naive failure | Decided handling | Enforced in |
|---|---|---|---|---|
| **EC-S01** | IndexedDB unavailable: Firefox private browsing, iOS Lockdown Mode, "block all cookies", WebView embeddings. | Unhandled promise rejection at boot → **white screen**, no message, no recovery. | D15. `bootStorage()` classifies, `StorageGate` renders a real screen with the cause and two actions: `[Try again]` and `[Continue without saving]` (memory mode). Memory mode keeps a permanent red banner and enables Export. | `app/boot/StorageGate.tsx` wraps the whole app and is rendered *before* any repo call. |
| **EC-S02** | Quota exceeded on write. | Transaction aborts silently; the user thinks the log saved; it's gone on reload. | `withTx` catches, aborts cleanly, rethrows a typed `StorageError`. A modal shows `navigator.storage.estimate()` usage/quota and offers `[Export backup]`, `[Empty Recently deleted]`, `[Delete archived goals]`. The failed write is retried once after cleanup. **The UI never shows an optimistic success before the tx commits** for write paths other than task completion (which is idempotent and reconciles). | `withTx`; `QuotaModal`. |
| **EC-S03** | iOS PWA storage evicted after 7 days of non-use (ITP), or the browser reclaims space. | Everything gone, no warning, no backup. | Call `navigator.storage.persist()` once, at the moment the **first goal is created** (a real engagement signal → high grant rate). Show the result in More → Storage ("Persistent: yes/no"). Independently: if `lastExportAt` is older than 30 days, More shows a non-modal reminder "Last backup: 47 days ago · [Export]" (§15 calls export critical). | `app/boot/requestPersistence.ts`; `MoreScreen`. |
| **EC-S04** | Two tabs open; both write. | Lost updates; one tab shows stale data indefinitely. | Every write goes through `withTx`, and IDB transactions are already serialisable — read-modify-write must happen **inside one tx** (never read, await, then write). After commit, `publishMutation(stores)` over `BroadcastChannel('goal-planner')`; other tabs invalidate the affected query keys. LWW by `updatedAt` is only a tiebreak for import merge, not for normal writes. | `data/sync/tabs.ts`; code review rule: no `await` between read and write inside a tx. |
| **EC-S05** | Two tabs both run `ensureMaterialized` at midnight. | Duplicate weeks / duplicate tasks. | Deterministic ids (D18) make materialization an idempotent `put`. Additionally `navigator.locks.request('materialize', …)` when available (feature-detected; absence is harmless because of D18). | `materialize.ts`. |
| **EC-S06** | Tab A upgrades the DB while tab B holds it open. | `blocked` event; the upgrade hangs forever; tab A shows a dead spinner. | Every open registers `db.onversionchange = () => { db.close(); showReloadScreen(); }`. The upgrading tab's `blocked` handler shows "The app is open in another tab. Close it to finish updating." with `[Retry]`. | `data/db.ts`. |
| **EC-S07** | A migration throws halfway. | Half-migrated store, version bumped, permanently broken app. | Migrations run **inside the `upgradeneeded` transaction**, so a throw aborts the tx and the version does not advance — the DB stays valid at the old version (this is IndexedDB's own atomicity guarantee; no second database is needed on top of it). The app then renders `MigrationFailedScreen` with `[Export backup (old format)]` (export uses the pre-migration read path) and `[Retry]`. Every migration also ships a frozen fixture (DATA-MODEL.md §5.2) so this path is exercised in CI, not just hoped for. | `data/migrations/index.ts`. |
| **EC-S08** | A record fails its runtime shape check (hand-edited export, partial old migration, disk corruption). | `undefined.map` deep inside a chart → white screen. | `repo` reads pass every row through its hand-written type guard and **partition**: valid rows are returned; invalid rows are moved to the `__quarantine` store with `{ store, id, raw, error, at }` and counted. A single bad row can never crash a screen. More → Diagnostics shows quarantine count with `[Export quarantined rows]` and `[Discard]`. | `repo/base.ts → readAllValidated()`. |
| **EC-S09** | `crypto.randomUUID` missing (iOS Safari < 15.4, non-secure origin). | `TypeError` at goal creation. | `src/lib/id.ts`: use `crypto.randomUUID` when present, else build a v4 from `crypto.getRandomValues(new Uint8Array(16))`, else (no WebCrypto at all) a time+`Math.random` fallback with a logged warning. Never throws. | `lib/id.ts`. |
| **EC-S10** | Service worker serves an old bundle after a deploy; the DB was already upgraded by a newer tab. | Old code writes rows the new schema can't read → silent corruption. | D16, two guards: (1) SW is **network-first for `/` and the HTML shell**, stale-while-revalidate for hashed assets, and **never auto-`skipWaiting`** — an update shows "A new version is ready · [Reload]". (2) At boot, if `db.version > APP_SCHEMA_VERSION`, the app enters **read-only mode**: all repo writes throw `StaleAppError`, and a blocking banner says "This tab is out of date — Reload". | `public/sw.ts`; `bootStorage()` `db-newer-than-app` branch. |
| **EC-S11** | App opened with no network at all (the normal case, §18). | A "Connecting…" spinner or an offline banner that implies broken sync. | **There are no network states in V1.** `navigator.onLine` is never read; the word "sync" appears nowhere; More says "Stored on this device only." (D17/§19). | Copy review; CI grep forbidding `navigator.onLine` and `/sync/i` in `src/**/*.tsx` outside `data/sync/tabs.ts`. |
| **EC-S12** | User has 3 years of data; app boot reads everything. | 2–3 s blank screen on a mid-range phone. | Today/Goals query by index ranges only (`tasks.by_date` bound to `[today-7, today+1]`; `entries.by_goal_date` bound to the visible chart window). No unbounded `getAll()` exists outside Export and Diagnostics. | `repo/*.ts` — every `getAll` must pass an `IDBKeyRange` (review rule). |

`StorageGate` — the no-white-screen boundary:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│   This browser isn't letting the app save data   │
│                                                  │
│   Private browsing windows and some privacy      │
│   settings block local storage. Your goals need  │
│   it to persist between visits.                  │
│                                                  │
│   Try: open the app in a normal window, or       │
│   allow site data for this site.                 │
│                                                  │
│            [ Try again ]                         │
│            [ Continue without saving ]           │
│                                                  │
└──────────────────────────────────────────────────┘
      bg #FEF2F2 · border #FECACA · text #7F1D1D
```

Memory-mode banner, always visible, `#B91C1C` on `#FEF2F2`:

```
● Not saving — everything is lost when you close this tab.  [Export]
```

Quota modal:

```
┌───────────────────────────────────────────────┐
│  Couldn't save — storage is full              │
│                                               │
│  Used 1.98 GB of 2.00 GB                      │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░       │
│                                               │
│  Your last entry was not saved.               │
│                                               │
│  [Export a backup]                            │
│  [Empty Recently deleted (2 goals, 4.1 MB)]   │
│  [Delete archived goals (1)]                  │
│                                               │
│                       [Close]  [Try again]    │
└───────────────────────────────────────────────┘
```

---

## F. Planning math

```ts
// src/domain/planner/spec.ts
export type FeasibilityCode =
  | 'OK' | 'TIGHT' | 'MAINTENANCE'
  | 'DEADLINE_IN_PAST' | 'DEADLINE_TOO_SOON'
  | 'NO_AVAILABLE_DAYS' | 'EXCEEDS_DAILY_CAPACITY' | 'HORIZON_TOO_LONG';

export interface Feasibility {
  code: FeasibilityCode;
  message: string;                 // user-facing, factual
  suggestedDeadline?: LocalDate;     // the earliest deadline that makes code === 'OK'
  suggestedPerWeek?: [number, number]; // a RANGE, never a single prediction (§4)
}

export interface PlanSpec {
  version: number;
  weekStartsOn: 0 | 1;
  planStartWeek: WeekKey;
  deadlineWeek: WeekKey;
  availableDaysPerWeek: number;    // 1..7
  allowMultiplePerDay: boolean;    // default false
  totalQuantity: Record<string /*activityId*/, number>;
  perWeekBand: Record<string, [number, number]>;
}

export function buildPlanSpec(goal: Goal, today: LocalDate): { spec: PlanSpec; feasibility: Feasibility };
export function weekTargetsFor(spec: PlanSpec, weekStart: WeekKey, weights: number[]): WeekTarget[];
```

| ID | Trigger | Naive failure | Decided handling | Enforced in |
|---|---|---|---|---|
| **EC-P01** | `weeksRemaining === 0` (deadline is this week) or negative (EC-L01). | `remaining / 0` → `Infinity`; `Infinity` rendered as a target; `NaN` bars. | Guard **before** any division: `weeks <= 0` → `DEADLINE_IN_PAST` or `DEADLINE_TOO_SOON`, `weeks: []`, and a `suggestedDeadline`. No division is ever reached. Unit test asserts no `Infinity`/`NaN` escapes `buildPlanSpec` for any input. | `buildPlanSpec` first guard. |
| **EC-P02** | `target === current` (maintain 50 kg). | `delta === 0` → per-week 0 → "nothing to do", or `0/0` in progress. | `code:'MAINTENANCE'`. The plan keeps habit targets (workouts, logging) but sets the metric delta to 0. `metricProgress` with `start === target` returns `fraction = nearlyEqual(current, target, band) ? 1 : 0`, `state:'maintenance'`, where `band = max(1 unit, 2% of target)`. | `progress/metric.ts`. |
| **EC-P03** | Negative-direction goal (80 → 72 kg). | Progress formula assumes increase → negative percentages; "behind" logic inverted. | Direction-agnostic: `raw = (current − start) / (target − start)` works for both signs; `direction = Math.sign(target − start)`. Guard `target === start` first (EC-P02). `fraction = clamp(raw, 0, 1)` (D22). | `progress/metric.ts`. |
| **EC-P04** | `availableDaysPerWeek === 0` (slider bug, or imported data). | `sessions / 0` → `Infinity` tasks per day. | Wizard slider `min=1`. Defence in depth: `buildPlanSpec` returns `NO_AVAILABLE_DAYS` and produces **weekly targets with zero daily tasks** — the plan still exists and is trackable by logging directly (§12), it just has no day slots. | `buildPlanSpec`; a hand-written range guard (`1..7`) on the goal validator. |
| **EC-P05** | Plan needs 5 sessions/week but only 3 available days. | 5 tasks squeezed onto 3 days, or silently truncated to 3 and the deadline quietly becomes unreachable. | Clamp `sessionsPerWeek = min(requested, availableDaysPerWeek × (allowMultiplePerDay ? 2 : 1))`, set `EXCEEDS_DAILY_CAPACITY`, and compute `suggestedDeadline` = the earliest deadline achievable at the clamped rate. The wizard shows: "3 days a week fits 3 sessions. At that pace, March 2027 becomes **May 2027**. [Use May 2027] [Add a day] [Keep March 2027 anyway]". Never silently truncate. | `buildPlanSpec`; `FeasibilityCard`. |
| **EC-P06** | Horizon of 10+ years (typo: 2036 instead of 2026). | 520+ weeks generated; export balloons; Plan screen janks. | `MAX_PLAN_WEEKS = 520`. Beyond it → `HORIZON_TOO_LONG` with "Deadlines more than 10 years out aren't supported. [Set to 2036-09-19 → 2036? Fix]". Materialization is capped independently (EC-P10), so even an accepted long horizon writes ≤ 8 week rows. | `buildPlanSpec`; `materialize.ts`. |
| **EC-P07** | Float accumulation: 0.25 kg/wk × 28 weeks. | `sum !== 7` (e.g. 6.999999999999999) → "0.0 kg remaining" while the bar sits at 99.98%. | All allocation is done in **integer minor units** (grams for kg, metres for km, minutes, counts) via `allocateLargestRemainder`, with a dev-mode assertion that the parts sum exactly. Display converts back at the edge. Comparisons use `nearlyEqual(a, b, 1e-6)`. | `planner/allocate.ts`; `lib/num/round.ts`. |
| **EC-P08** | A target range is presented as a single number ("You will weigh 45.1 kg on Nov 3"). | Violates §4 ("avoid presenting uncertain real-world progress as exact predictions"). | Metric *projections* are always rendered as a band: `perWeekBand = [rate × 0.6, rate × 1.4]`, rounded to display precision → "about 0.15–0.35 kg per week". Action targets (3 workouts) stay exact — those are under the user's control. Copy template: "at this pace, roughly Feb–Apr 2027". | `FeasibilityCard`; `formatBand()`. |
| **EC-P09** | Milestone target dates outside `[startDate, deadline]` (user-entered or imported). | Milestones render off the timeline; progress denominators go wrong. | `validateMilestone` clamps interactively: "That's after the goal deadline. [Move to Mar 31] [Extend deadline]". Invariant **INV-M1** checked in `validateDb()` and at import. | `goal/lifecycle.ts`. |
| **EC-P10** | Long horizon materialization. | 2600 rows/goal. | D14, exact rule below. | `materialize.ts`. |

```ts
// src/domain/planner/materialize.ts
export const MAX_MATERIALIZED_WEEKS = 8;      // rolling window from the current week
export const MAX_MATERIALIZED_TASK_DAYS = 14; // from today
export const MAX_PLAN_WEEKS = 520;            // hard cap on plan horizon (~10 years)

/** Idempotent. Runs at boot, at midnight rollover (EC-T04), after any re-plan, and on resume. */
export async function ensureMaterialized(goalId: string, today: LocalDate): Promise<{
  weeksCreated: number; tasksCreated: number; tasksPruned: number;
}>;
```

Rules:
1. Weeks written: `[cw .. min(deadlineWeek, addWeeks(cw, MAX_MATERIALIZED_WEEKS - 1))]`, upserted by deterministic id.
2. Weeks beyond the window are **virtual**: the Plan screen renders them from `planSpec` via `weekTargetsFor()` and shows them slightly dimmed with no per-week edit button until the window reaches them. Editing one materializes just that week (and marks it `userEdited`).
3. Tasks written: days `[today .. addDays(today, MAX_MATERIALIZED_TASK_DAYS - 1)]`, capped at the deadline.
4. Pruning: `pending`, `source:'generated'`, `userEdited === false` tasks with `date < addDays(today, -60)` are deleted to bound growth. `done`/`skipped`/user-created rows are **never** pruned.
5. Past weeks are never back-filled. A week that was never materialized (goal paused, or app unused) simply has no row; tallies treat "no row" as target 0, which correctly produces `no-data` rather than "missed".

---

## G. Import / Export (§15)

```ts
// src/features/dataio/types.ts
export const APP_MAGIC = 'goal-backward-planner';
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export interface BackupEnvelope {
  app: typeof APP_MAGIC;
  schemaVersion: number;
  exportedAt: string;        // ISO instant — metadata only, never used for date math (EC-T14)
  appVersion: string;
  data: BackupPayload;       // { settings, goals, milestones, weeklyPlans, tasks, entries }
}

export type ImportError =
  | { code: 'TOO_LARGE'; bytes: number }
  | { code: 'UNREADABLE'; detail: string }
  | { code: 'NOT_JSON'; detail: string; at?: number }
  | { code: 'NOT_OUR_FORMAT'; foundApp?: string }
  | { code: 'FUTURE_SCHEMA'; fileVersion: number; appVersion: number }
  | { code: 'NOTHING_VALID' };

export interface ImportReport {
  fileVersion: number;
  counts: Record<EntityName, { valid: number; invalid: number }>;
  problems: Array<{ entity: EntityName; index: number; id?: string; path: string; message: string }>;
  payload: BackupPayload;    // ONLY valid + referentially sound rows, already migrated forward
}

export async function validateImportFile(file: File):
  Promise<{ ok: true; report: ImportReport } | { ok: false; error: ImportError }>;

export async function applyImport(
  report: ImportReport, mode: 'replace' | 'merge',
): Promise<{ inserted: number; updated: number; skipped: number }>;
```

| ID | Trigger | Naive failure | Decided handling | Enforced in |
|---|---|---|---|---|
| **EC-I01** | Malformed JSON (truncated download, edited by hand). | `JSON.parse` throws → unhandled → white screen. | `try/catch` around `file.text()` and `JSON.parse`; `NOT_JSON` with the parser's character offset shown to the user: "The file isn't valid JSON (problem near character 84 120)." | `validateImportFile`. |
| **EC-I02** | Wrong file type (`.csv`, `.png`, a whole folder, a `.json` that is a Chrome bookmarks export). | Parse succeeds (bookmarks *are* JSON) → garbage imported. | `input accept=".json,application/json"`; then the **magic check**: `data.app === APP_MAGIC`. Anything else → `NOT_OUR_FORMAT` showing what was found: "This looks like a file from something else (found: \"bookmarks\")." | `validateImportFile`. |
| **EC-I03** | Enormous file (600 MB, or a zip-bomb-ish JSON). | Tab OOM-crashes before any check runs. | `file.size > MAX_IMPORT_BYTES` (25 MB) is checked **before reading a single byte** → `TOO_LARGE`. 25 MB is ~50 years of daily logs for one user; the cap is honest, not arbitrary. | `validateImportFile` first statement. |
| **EC-I04** | Partially valid data (3 of 45 tasks have a bad date). | All-or-nothing refusal, or silent dropping. | Per-row hand-written validation producing a `problems[]` list. The confirm screen states exactly: "Import 42 of 45 records · 3 skipped [see details]". Nothing is silently dropped. If **zero** rows validate → `NOTHING_VALID`. | `validateImportFile`; `ImportReviewScreen`. |
| **EC-I05** | `schemaVersion` newer than the app's. | Unknown fields dropped, or a crash. | `FUTURE_SCHEMA` → refused: "This backup was made with a newer version of the app. Update the app, then import." No partial import is attempted. | `validateImportFile`. |
| **EC-I06** | `schemaVersion` older. | Rows written in the old shape. | The **same** migration functions used for the DB run on the in-memory payload: `migratePayload(data, from, to)`. One implementation, two callers — schema drift between DB and import is structurally impossible. | `data/migrations/index.ts` exports both `migrateDb` and `migratePayload` from one migration list. |
| **EC-I07** | Referential garbage: a task whose `goalId` doesn't exist. | Orphan rows; crash on join. | A referential pass after shape validation. In `replace` mode, orphans are invalid (reported). In `merge` mode, an id is resolvable against the **current DB** too; unresolvable → reported as skipped. | `validateImportFile → checkRefs()`. |
| **EC-I08** | Duplicate ids inside the file. | Last one silently wins. | Duplicates are reported per entity ("2 goals share the same id"), and the **first** occurrence is kept — deterministic, and stated in the report. | `checkRefs()`. |
| **EC-I09** | Dates in the file are ISO instants rather than `LocalDate` (a third-party or hand-built file). | `'2026-09-19T00:00:00Z'` fails `isLocalDate` → everything skipped with an opaque message. | the validator's error message is explicit: `date must be YYYY-MM-DD (got "2026-09-19T00:00:00Z")`. No coercion — coercing would reintroduce the timezone bug (D1). | the `isLocalDate` guard. |
| **EC-I10** | **Replace** chosen. | Existing data wiped; the user realises they picked the wrong file. | Replace **forces an automatic export of current data first** (a real file download, and it must succeed) before the wipe. Then wipe+write happen in a **single `readwrite` transaction** over all stores — an abort leaves the old data intact. Confirm copy: "This replaces everything on this device. A backup of your current data was saved to your Downloads first." | `applyImport('replace')`. |
| **EC-I11** | **Merge** chosen with overlapping ids. | Unpredictable which version survives. | Id-preserving upsert, **last-write-wins by `updatedAt`**; equal `updatedAt` → the imported row wins (the user explicitly asked to import). No re-keying, no id remapping (rejected: it silently duplicates goals and is impossible to explain). The review screen shows "12 new · 5 updated · 3 unchanged" before applying. | `applyImport('merge')`. |
| **EC-I12** | Import interrupted (tab closed, quota hit mid-write). | Half-imported DB. | One transaction for the whole import (both modes). Quota mid-tx → abort → nothing changed → the quota modal (EC-S02). Payloads over ~5 000 rows are chunked *per store* but still inside a single tx over all stores. | `applyImport`; `withTx`. |
| **EC-I13** | Post-import invariants violated by data that was individually valid (a task after its goal's deadline). | Latent corruption surfacing weeks later. | `validateDb()` runs immediately after import; violations are auto-repaired where repair is unambiguous (clamp task dates to the deadline, `normalizePauses`, SET NULL dangling FKs) and the repairs are listed in the result screen. | `validate/invariants.ts`. |
| **EC-I14** | Export while in memory mode (EC-S01). | Export button disabled → the user loses everything. | Export reads through the same repo interface, which is backed by the in-memory store in memory mode. Export **always works**. | `repo` interface has two implementations; export depends on the interface. |

Import review screen:

```
┌──────────────────────────────────────────────────┐
│  Review import                                   │
│  goal-planner-backup-2026-09-19.json · 412 KB    │
│  Made 2026-09-19 · format v1 (current)           │
│                                                  │
│  Goals            3 ✓                            │
│  Milestones      11 ✓                            │
│  Weekly plans    28 ✓                            │
│  Daily tasks     42 ✓    3 skipped  [details]    │
│  Measurements   180 ✓                            │
│                                                  │
│  ○ Merge into my data   12 new · 5 updated       │
│  ● Replace everything   (current data is backed  │
│      up to Downloads first)                      │
│                                                  │
│                  [Cancel]      [Import]          │
└──────────────────────────────────────────────────┘
```

---

## H. UX safety

### H.1 Confirm vs Undo matrix (D17)

| Action | Confirm? | Undo? | Trash? | Why |
|---|---|---|---|---|
| Complete a task | no | yes — tap again (idempotent both ways) | no | One-tap is the core interaction (§7). |
| Skip a task | no | yes — tap again | no | Reversible, low stakes. |
| Delete one task | no | **yes, 8 s snackbar** | no | Cheap to undo; a dialog for one row is hostile. |
| Edit a week's targets | no | in-form Cancel | no | Explicit, visible, reversible by editing again. |
| Re-plan (apply diff) | **preview sheet** | **yes, session-scoped reverse patch** | no | Touches many rows at once; the preview *is* the confirmation. |
| Delete a measurement | no | **yes, 8 s snackbar** | no | Single row, restorable. |
| Pause a goal | no | yes — Resume | no | Non-destructive by design. |
| Archive a goal | **yes, with counts** | yes — Unarchive | no | Deletes pending future tasks. |
| **Delete a goal** | **yes, with counts** | **yes, 10 s snackbar** | **yes, 30 days** | Cascades across 5 stores. Three layers of safety. |
| Delete a milestone | **yes** | no | no | Confirm carries the opt-in "also delete tasks" choice. |
| **Import (replace)** | **yes + forced auto-export** | no (the auto-export is the undo) | no | The single most destructive action in the app. |
| Clear Recently deleted | **yes** | no | — | It *is* the last safety net. |
| Change `weekStartsOn` | **yes, explains history** | no | — | Changes how every week is bucketed going forward. |

Delete-goal dialog:

```
┌───────────────────────────────────────────────┐
│  Delete "Fitness"?                            │
│                                               │
│  This removes                                 │
│    180 weight entries                         │
│     62 completed tasks                        │
│     28 weekly plans                           │
│      4 milestones                             │
│                                               │
│  It moves to Recently deleted for 30 days.    │
│                                               │
│            [Cancel]        [Delete]           │
│                            #B91C1C            │
└───────────────────────────────────────────────┘

then:  ┌────────────────────────────────────┐
       │ "Fitness" deleted        [Undo]    │   10 s
       └────────────────────────────────────┘
```

### H.2 Cases

| ID | Trigger | Naive failure | Decided handling | Enforced in |
|---|---|---|---|---|
| **EC-U01** | Accidental double-tap on one-tap complete. | Double count. | Idempotent write (EC-K01) + 400 ms `pointerdown` lockout per task id + `touch-action: manipulation` on the row (kills the 300 ms double-tap-zoom delay, which is itself a source of double fires). | `TaskRow`; `completeTask`. |
| **EC-U02** | Fat-finger delete on a list row. | Data loss. | Destructive actions are never on the row's primary surface — they live behind a `⋯` sheet or a deliberate swipe with a 64 px threshold. Minimum 44×44 px touch targets (§17). | `SwipeRow` component. |
| **EC-U03** | App shows "Syncing…" / offline banners. | Implies cloud behaviour that doesn't exist; erodes trust (§19). | D17/EC-S11: no network state anywhere. More screen: "Stored on this device only · Last backup 2 days ago". | Copy review + CI grep. |
| **EC-U04** | A week with 0 of 3 done, viewed on Sunday. | "FAILED — 0%" in red. | "You completed 0 of 3 planned workouts." in `#475569`, followed by one forward-looking action: `[Keep this week's plan]` / `[Move to next week]` (§5). No red, no streak break, no score. | `WeekSummaryCard`; D20. |
| **EC-U05** | A long-untouched goal (no activity for 6 weeks). | A wall of "missed" chips on Today. | Goals with no activity for 21 days surface a single neutral prompt on Today: "Fitness — no activity since Aug 8. [Keep going] [Pause] [Archive]". Individual missed chips stay collapsed under "Earlier". | `TodayScreen → staleGoalPrompt()`. |
| **EC-U06** | Rapid navigation while a write is in flight. | Write lands after unmount → `setState` on unmounted component; or the write is cancelled. | Writes are fire-and-await at the repo layer, never tied to component lifetime. Components subscribe to invalidation; no write is cancelled by navigation. | `repo/*`; query-cache invalidation via `sync/tabs.ts`. |
| **EC-U07** | User taps Export; the browser blocks the download (iOS PWA standalone quirk). | Nothing happens; the user thinks export worked. | Export uses an `<a download>` + object URL, and on failure (or on iOS standalone, detected) falls back to `navigator.share({ files })`, and finally to a full-screen "Copy your backup" view with a select-all text area. `lastExportAt` is written **only** after a confirmed hand-off. | `dataio/export.ts`. |
| **EC-U08** | Dark mode / system theme. | Hard-coded light hexes make the caution and error surfaces unreadable. | Every semantic colour above is a CSS custom property with a `prefers-color-scheme: dark` override. Dark equivalents: caution `#78350F`→bg, text `#FDE68A`; error bg `#450A0A`, text `#FECACA`; missed chip bg `#1E293B`, text `#94A3B8`. | `src/styles/tokens.css`. |

---

## I. Machine-checkable invariants

```ts
// src/domain/validate/invariants.ts
export type Violation = { code: string; entity: EntityName; id: string; detail: string; repairable: boolean };
export interface DbReport { violations: Violation[]; repaired: Violation[]; quarantined: number; }

export async function validateDb(opts?: { repair?: boolean }): Promise<DbReport>;
```

| Code | Invariant | Auto-repair |
|---|---|---|
| INV-G1 | `goal.startDate <= resolveDeadline(goal.deadline)` | no — surfaces a fix prompt |
| INV-G2 | `goal.status ∈ {active,paused,archived}`; `paused` ⇒ an open pause interval exists | yes (open one at `today`) |
| INV-G3 | `pauses` sorted, non-overlapping, ≤ 1 open | yes (`normalizePauses`) |
| INV-W1 | `WeeklyPlan.id === \`${goalId}:${weekStart}\`` for `source:'generated'` | yes (rewrite id) |
| INV-W2 | `startOfWeek(weekStart, weekStartsOn) === weekStart` | no |
| INV-T1 | `task.date <= resolveDeadline(goal.deadline)` for non-archived goals (EC-K05) | yes (clamp) |
| INV-T2 | a task with children has `activityId === null` (EC-K11) | yes (null it) |
| INV-M1 | `goal.startDate <= milestone.targetDate <= deadline` (EC-P09) | yes (clamp) |
| INV-R1 | every `weeklyPlanId` / `milestoneId` resolves or is `null` | yes (SET NULL) |
| INV-R2 | every `goalId` resolves | no — quarantine |
| INV-R3 | every `activityId` on an entry resolves (incl. retired, EC-M12) | no — quarantine |
| INV-D1 | every `LocalDate` field round-trips `asLocalDate` | no — quarantine |
| INV-U1 | `measurement.canonicalUnit === UNIT_TABLE[entry.unit].canonical` | yes (recompute canonical from `entry`) |

`validateDb()` runs: after every import, from More → Diagnostics, and in dev after every mutation (`import.meta.env.DEV`).

---

## J. Priority: MUST in V1 vs deliberately deferred

### MUST — V1 does not ship without these

Losing any of these either corrupts data, loses data, or violates the spec's tone rules.

1. **EC-T01/T02/T03** civil-date layer (D1, D2). Everything else sits on it.
2. **EC-T04** midnight rollover + `TodayProvider` (D3) — §7 makes Today the home screen.
3. **EC-T12** month-precision deadlines (D10) — §2 requires "March 2027".
4. **EC-T08/T09** first/last partial week proration — otherwise week 1 is always "behind".
5. **EC-M06/EC-K04** no future logging (D8).
6. **EC-M02/EC-K01** idempotent completion (unique index + deterministic ids, D18).
7. **EC-M08/M08a** canonical-unit storage (D6) — irreversible if shipped wrong.
8. **EC-M03 / D7** derived actuals — irreversible architecture choice.
9. **EC-M09** `parseDecimal` — silent data corruption on non-US locales.
10. **EC-K01–K05, K08** task state semantics (D4, D5) — the arithmetic the whole app displays.
11. **EC-L05/L07/L08/L09** pause / archive / cascade delete with trash + undo (D13, D17).
12. **EC-L02/L03** re-plan merge rule with `userEdited` (D12) — §4 and §5 are unimplementable without it.
13. **EC-S01/S02** storage gate and quota handling (D15) — the white-screen class.
14. **EC-S07/S08** transactional migrations + row quarantine.
15. **EC-S10** stale-bundle read-only guard (D16).
16. **EC-P01–P05** all division guards and feasibility codes.
17. **EC-P10** lazy materialization (D14) — retrofitting it later means rewriting the planner.
18. **EC-I01–I06, I10–I12** import validation + transactional apply (§15 calls this critical).
19. **EC-U01/U04** double-tap guard and non-punitive copy (D20).
20. **EC-S03** `storage.persist()` + export reminder — cheap, and the only defence against ITP eviction.

### DEFERRED — explicitly out of V1, with the reason

| Deferred | Why it's safe to defer | What V1 does instead |
|---|---|---|
| **EC-T05/T06 auto-correcting a wrong clock** | Single-user, local-only; auto-correction is guesswork and can rewrite good data. | Advisory banner only. |
| **Per-week timezone stamping** (recording the tz each log was made in) | `LocalDate` already makes travel a non-event. The tz would be display trivia. | Nothing stored; the data model leaves room for an optional `tz` field later. |
| **CRDT / vector-clock merge for two tabs** | IDB transactions plus idempotent, deterministic ids cover every realistic single-user race. | `withTx` + BroadcastChannel invalidation + LWW on import only. |
| **Id remapping on import merge (EC-I11)** | Ambiguous and impossible to explain to a single user merging their own backups. | LWW by `updatedAt`, shown in the review screen. |
| **Automatic repair of quarantined rows (EC-S08)** | Guessing at corrupt data risks silently inventing history. | Quarantine + export + manual discard. |
| **Retroactive re-bucketing when `weekStartsOn` changes (EC-T07)** | Rewrites history to answer a cosmetic preference. | Past weeks keep their boundaries; future weeks re-plan. |
| **Backfill of never-materialized past weeks (EC-P10 r5)** | Inventing plans the user never saw, then marking them missed, is exactly the failure framing §5 forbids. | "No plan for this week" renders as `no-data`. |
| **Conflict UI for two tabs editing the same week** | Vanishingly rare for one user on one device. | Last commit wins; the other tab refreshes within ~50 ms. |
| **Undo for import and for milestone delete** | The forced pre-import export and the milestone confirm dialog cover them. | Confirm-only. |
| **Sanity-bound learning (EC-M10 adapting to the user)** | Premature. | Static bounds table + "Save anyway". |
| **Multi-currency for savings goals** | No V1 use case in §2. | `count` canonical unit with a free-text label; `currency` reserved in `CanonicalUnit` later. |

---

## K. Test matrix (pure functions — these are the ones that must have tests)

`src/lib/date/civil.test.ts`

| Input | Expect |
|---|---|
| `addDays('2027-03-13', 1)` | `'2027-03-14'` (US DST spring-forward, 23 h day) |
| `eachDay('2027-03-13','2027-03-15').length` | `3` |
| `addDays('2026-10-24', 1)` | `'2026-10-25'` (EU fall-back, 25 h day) |
| `diffDays('2026-11-02','2026-11-01')` | `1` (US fall-back) |
| `addMonthsClamped('2028-01-31', 1)` | `'2028-02-29'` (leap) |
| `addMonthsClamped('2027-01-31', 1)` | `'2027-02-28'` |
| `startOfWeek('2026-09-19', 1)` | `'2026-09-14'` (Sat → Mon) |
| `startOfWeek('2026-09-19', 0)` | `'2026-09-13'` (Sat → Sun) |
| `lastDayOfMonth('2027-03')` | `'2027-03-31'` |
| `monthOf('2026-10-02')` | `'2026-10'` — but its week groups under `'2026-09'` (D11) |
| `weeksBetween('2026-09-14','2027-03-29')` | `28` |
| `asLocalDate('2028-02-30')` | throws |
| `toLocalDate` under `TZ=Pacific/Kiritimati` and `TZ=Pacific/Niue` at the same instant | different keys — proves locality is intentional |

`src/domain/planner/*.test.ts`

| Case | Expect |
|---|---|
| 43→50 kg, start 2026-09-19, deadline `{month:'2027-03'}` | 28 weeks; band `0.15–0.35 kg/wk`; `code:'OK'` |
| same with deadline `2026-09-20` | `code:'DEADLINE_TOO_SOON'`, `weeks: []`, `suggestedDeadline` present |
| deadline `2026-09-01` | `code:'DEADLINE_IN_PAST'`, no `Infinity`/`NaN` anywhere in the result |
| `current === target === 50` | `code:'MAINTENANCE'`, no division performed |
| `availableDaysPerWeek: 0` | `code:'NO_AVAILABLE_DAYS'`, weekly targets present, 0 day slots |
| 5 sessions/wk with 3 available days, `allowMultiplePerDay:false` | clamp to 3, `EXCEEDS_DAILY_CAPACITY`, `suggestedDeadline` later than requested |
| `allocateLargestRemainder(7000 /*g*/, weights of 28 weeks incl. 2/7 and 3/7 partials)` | parts sum to exactly `7000` |
| deadline 2036-09-19 | `HORIZON_TOO_LONG` |
| `planReplan` with 2 userEdited future weeks | those 2 in `kept`, their quantity excluded from `remaining` |
| `planReplan` shortening the deadline past 3 weeks, 1 of them userEdited | 2 in `deleted`, 1 in `orphaned` |
| `planReplan` with current week `done=2`, allocation `1` | `target_cw === 2` |
| `ensureMaterialized` run twice for the same day | second run: `weeksCreated:0, tasksCreated:0` |

`src/domain/tasks/status.test.ts`

| Case | Expect |
|---|---|
| `pending`, date yesterday, not paused | `'missed'` |
| `pending`, date yesterday, inside a pause interval | `'pending'` |
| `skipped`, date yesterday | `'skipped'`; excluded from `adherence` denominator |
| `tallyWeek` all-`skipped` week | `adherence() === null` → UI renders "—" |
| `weekBand(0, 0, 3)` (Monday, no slots elapsed) | `'no-data'` |
| `weekBand(1, 1, 3)` | `'on-track'` |
| `weekBand(0, 2, 3)` | `'behind'` |
| `weekBand(3, 2, 3)` | `'ahead'` |
| `completeTask` twice | identical row, `updatedAt` unchanged, one broadcast |

`src/domain/units.test.ts`

| Case | Expect |
|---|---|
| enter `43.5 kg`, display kg | `"43.5 kg"` (verbatim path) |
| enter `43.5 kg`, display lb | `"95.9 lb"` |
| enter `43.5 kg`, display lb, switch back to kg | `"43.5 kg"` — byte-identical to the first |
| enter `95 lb`, stored | `value === 43.0914` (canonical kg, 6 dp), `entry === {95,'lb'}` |
| `compatible('min','kg')` | `false` — logging blocked |
| `parseDecimal('43,5')` | `43.5` |
| `parseDecimal('43.5.1')` | `null` |
| `parseDecimal('1 234,5')` | `1234.5` |

`src/features/dataio/importValidate.test.ts` — one test per `ImportError` code, plus a golden round-trip: export → import(replace) → export produces a byte-identical `data` object (proves EC-T14 and EC-I06).

---

## L. Open product questions

These are genuine judgement calls, not engineering unknowns. The defaults below ship if no answer comes.

1. **Trash retention** is set to 30 days. Shorter (7) saves space on constrained devices; longer (90) is safer. *Default: 30.*
2. **Stale-goal prompt threshold** is 21 days of no activity (EC-U05). Could feel nagging at 14, invisible at 45. *Default: 21.*
3. **Export reminder** at 30 days since last backup (EC-S03). *Default: 30, non-modal.*
4. **Band width for "on track"** is ±15% (`weekBand`). Tighter is more honest, looser is kinder. *Default: 0.85 / 1.15.*
5. **Projection band width** is ±40% of the nominal rate (EC-P08). This governs how cautious "roughly Feb–Apr 2027" reads. *Default: 0.6–1.4×.*
