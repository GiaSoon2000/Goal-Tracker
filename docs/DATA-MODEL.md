# Dimension Design — Data Model, IndexedDB Schema, Migrations

**App:** Goal Backward Planner (V1, local-first PWA)
**Spec:** `D:\Self Project\Goal Tracker\docs\SPEC.md`
**Scope of this document:** domain types, persistence, versioning. Everything below is committed, not a menu.
**Date:** 2026-09-19

---

## 0. Decisions

| Decision | Rationale | Rejected alternative |
|---|---|---|
| **`Goal` is a discriminated union on `type` with a per-type `config` object** | One `goals` store, one `Table<Goal>`, exhaustive `switch (goal.type)` checked by the compiler. `config` is never indexed, so adding a per-type field never touches IndexedDB. | Sparse columns (`currentValue?`, `currentLevel?`, `targetOutcome?` …) — ~14 nullable fields, no exhaustiveness checking, every consumer re-validates. |
| **`Activity` is the central new concept: a goal owns N trackable streams, each with its own kind and weekly cadence** | §2/§9 require one Fitness goal to hold *both* a metric (weight) *and* habits (workout 3×, weigh-in 3×). Weekly targets, daily tasks and track entries all hang off `activityId`, so "Workout 2/3, Weight logs 3/3" (§9) is one uniform aggregation. | Weekly targets attached directly to the goal (expresses only one number per goal); or hardcoded `goal.workoutsPerWeek` (dead end for singing/piano/savings). |
| **`Activity.role: 'outcome' \| 'input'`** | Separates *the result being moved* (weight → 50 kg) from *the work that moves it* (3 workouts/week). §8 "Progress: 7%" reads outcome; §9 "This week 2/3" reads inputs. | A flat list of activities — nothing then knows which stream defines "7% done". |
| **`TrackEntry` = shared base + tagged `value` union on `kind`; all kind-specific data lives inside `value`** | §12 demands extensibility. Adding `checklist` later = 1 union member + 1 adapter. No store, keyPath, index or stored-record change → **no IndexedDB version bump, no data rewrite**. | One store per tracking type (4 stores, 4× the query code, "recent activity" becomes a manual merge-sort). |
| **Calendar dates are `'YYYY-MM-DD'` branded strings; instants are epoch-ms numbers** | Lexicographic order == chronological order, so the string *is* a valid IndexedDB key and `between('2026-09-14','2026-09-20')` is the week query. Immune to DST and to the user travelling. Human-readable in the export file (§15). | `Date` objects (structured-clone stores them, but they shift with the TZ and export serialises to UTC ISO, moving a 00:30 local log to the previous day); epoch-ms for calendar days (every comparison needs a TZ-aware floor). |
| **Week key = the week's start date (`weekStart: LocalDate`), never an ISO week number** | Week start is user-configurable (Mon/Sun); `'2026-W38'` means a *different 7 days* under a different setting. A date key is unambiguous forever and ranges natively. ISO labels are generated for display only. | `weekKey: '2026-W38'` — ambiguous under Sunday-start and needs a parser to do date maths. |
| **Dexie 4 + `dexie-react-hooks`** | Declarative versioned schema + `.upgrade()` is the largest migration-ergonomics win available, and `useLiveQuery` deletes an entire hand-rolled reactive-cache layer (§21 "keep it simple"). ≈27 kB min+gzip buys ~400 fewer lines of our code. | `idb` (≈1.5 kB but zero reactivity → we write the pub/sub and the manual `onupgradeneeded` switch ourselves); raw IndexedDB (callback soup). |
| **Two independent version numbers: `DB_VERSION` (structure) and `SCHEMA_VERSION` (record shape)** | They change for different reasons. Adding an index bumps only `DB_VERSION`; renaming a field bumps only `SCHEMA_VERSION`. The export file (§15) carries `SCHEMA_VERSION` — it has no idea what indexes exist. | One number — every index tweak would invalidate old backup files for no reason. |
| **One set of pure record-migrators serves both the live DB upgrade and the import path** | `MIGRATIONS[n].record.entries(rec)` is called by Dexie `.upgrade()` *and* by `migrateExportDoc()`. An old backup and an old database physically cannot diverge. | Separate import-migration code — drifts, and you find out a year later when someone restores a backup. |
| **`WeeklyPlan` stores targets only; actuals are always derived from `entries`** | §16 lists `actuals`, but a stored actual goes stale the instant an entry is edited, backdated, or a task is rescheduled (§11). Derivation is one indexed range read per goal-week. Deliberate, documented deviation from §16. | Denormalised `actuals` — two sources of truth; "planned vs actual" (§13) starts lying after the first edit. |
| **`Goal.currentValue` is derived, not stored** | §9 must show "Current: 43.5 kg" == the newest weigh-in. Storing it means every entry write must remember to update the goal. `startValue`/`targetValue`/`unit` *are* stored — they are user intent, not derived. Second documented deviation from §16. | A stored `currentValue` — the classic staleness bug. |
| **Plans and tasks materialise lazily (current week + any week the user opens)** | A goal running to March 2027 is 78 weeks; pre-generating 78 rows × N goals persists guesses that re-planning (§5) invalidates immediately. Future weeks are *projected* on the fly; a row is written only when the week becomes current or the user edits it. | Pre-generating the whole horizon — hundreds of stale rows that re-plan must reconcile. |
| **Archive = a `status` value; Delete = hard cascading delete + a per-deletion row in a `trash` store, 30-day retention** | §8 lists Pause / Archive / Delete as three different operations. V1 has no sync (§20), so `deletedAt` tombstones would exist purely for undo while forcing `!deletedAt` into every query forever. One `trash` row per deletion buys real, multi-item undo (§8 "Recently deleted") in ~50 lines. | `deletedAt` tombstones on every table (permanent query tax); or a single `meta` slot (only the most recent deletion is recoverable — a real gap once a user deletes two goals). |
| **IDs are bare UUIDv4 from `crypto.randomUUID()` with a `getRandomValues` fallback, typed with TS brands** | Secure context is guaranteed — a PWA service worker requires HTTPS or localhost (§18). Brands give compile-time `GoalId ≠ ActivityId` at zero runtime cost. | Prefixed ids (`g_…`) — invite runtime string parsing; auto-increment integers — collide on import/merge. |
| **No nullable or boolean field is ever an IndexedDB index key** | `null`, `undefined` and `boolean` are **not valid IDB keys**: a record with `targetDate: null` is *silently absent* from an index on `targetDate`. The #1 Dexie footgun. Nullable fields stay unindexed; if one must be indexed it gets a non-null sentinel. | Indexing `targetDate` / `archived` directly — silently missing rows, found by the user rather than by a test. |
| **Hand-written validators in `src/data/validate.ts`, no zod** | §15 needs *referential* validation (orphan `activityId`, dangling `goalId`, duplicate `(goalId, weekStart)`) that a schema library does not provide anyway; the shape checks are ~200 lines. §21 prefers fewer dependencies. | zod (≈13 kB gz **and** we still hand-write the cross-reference pass). |
| **All computation is pure functions over plain arrays; the data layer only reads and writes** | `summarizeWeek()`, `goalProgress()`, planning and re-planning become unit-testable with literal fixtures, in Node, with no IndexedDB. | Queries inside components / logic inside Dexie hooks — untestable. |
| **`TaskStep[]` is embedded in `DailyTask`, not its own store** | Steps (§11 breathing / warm-up / song) are only ever read with their parent. Embedding removes a store, an index and an N+1 read. | A `steps` store — pure overhead for a 3-element array. |
| **Single-writer repository layer (`src/data/repo/*.ts`); UI never touches `db.*` directly** | Keeps `updatedAt` stamping, cascade rules and transaction boundaries in one place. | Components calling Dexie inline — `updatedAt` gets forgotten in 3 of 11 call sites. |

---

## 1. The central modelling decision: Goal → Activity → Entry

This is the decision the rest of the app stands on, so it gets its own section.

### 1.1 The problem

§2 Fitness: *current 43 kg → 50 kg by March 2027; workout 3 sessions/week; weight tracking several times/week.*
That single goal contains **three different things**:

1. an **outcome** measured as a number over time (weight, kg) — drives "Progress: 7%" (§8) and the line chart (§13);
2. an **input habit** with a weekly count target (workout) — drives "2 / 3 workouts" (§9) and today's checkbox (§7);
3. a second input that is *itself* a measurement cadence (weigh-in 3×/week) — simultaneously a metric stream and a habit target.

§2 Singing needs a **duration** stream (30 min practice) plus a practice-day count. §2 Piano needs milestones plus a **session** stream. A field such as `goal.workoutsPerWeek` cannot express any of this, and per-type field sets explode combinatorially across four goal types × four tracking kinds.

### 1.2 The commitment

> **A `Goal` owns N `Activity` records. An `Activity` is one trackable stream: name, `TrackKind`, `role`, unit, default weekly target and scheduling rule. Every `TrackEntry`, every `WeeklyTarget` and every `DailyTask` points at an `activityId`.**

Fitness:

```
Goal "Fitness"  type=metric  config{ startValue:43, targetValue:50, unit:'kg', direction:'increase' }
 ├─ Activity "Weight"        kind=metric   role=outcome  unit='kg'  defaultTarget{ aggregate:'count', amount:3 }
 ├─ Activity "Workout"       kind=session  role=input    unit=null  defaultTarget{ aggregate:'count', amount:3 }
 └─ Activity "Nutrition log" kind=habit    role=input    unit=null  defaultTarget=null        (optional, §4)
```

Singing:

```
Goal "Singing"  type=skill  config{ currentLevel:'Beginner', targetOutcome:'Sing 3 songs on pitch' }
 └─ Activity "Practice"  kind=duration  role=input  unit='min'
      defaultTarget{ aggregate:'count', amount:6 }        ← "practice 6 days/week"
      scheduling{ mode:'daysPerWeek', daysPerWeek:6, defaultMinutes:30,
                  stepTemplate:[Breathing 5, Vocal warm-up 10, Song practice 15] }   (§11)
```

Piano:

```
Goal "Piano"  type=skill  config{ currentLevel:'Beginner', targetOutcome:'Play 5 songs' }
 ├─ Milestone "Basic chords"   order 0      ← milestones carry skill/project progress
 ├─ Milestone "Major scales"   order 1
 ├─ Milestone "Song: Für Elise" order 2
 └─ Activity  "Practice session"  kind=session role=input defaultTarget{ aggregate:'count', amount:3 }
```

### 1.3 Why `role` earns its place

`role` is what lets one table answer two different questions:

* **"How far along am I?"** (§8 `Progress: 7%`) → the **outcome** stream's latest entry, or — for skill/project goals with no outcome metric — weighted milestone completion.
* **"Am I doing the work?"** (§9 `This week: Workout 2/3`) → aggregate the **input** streams against this week's targets.

Without `role`, "Progress" would have to be guessed from activity order or a magic name. With it, `goalProgress()` is a ~25-line pure function with an exhaustive `switch (goal.type)`.

**Invariant (enforced in `validate.ts`, not by the type system):** at most one activity per goal has `role: 'outcome'`. A `metric` goal must have exactly one; `habit`, `skill` and `project` goals must have none.

### 1.4 One stream, several aggregates

"Practice 6 days a week" and "practice 150 minutes a week" are **the same stream through two aggregates**, not two activities:

| `aggregate` | meaning | example | formula |
|---|---|---|---|
| `count` | number of entries in the window | Workout 3×/week | `entries.length` |
| `sum` | Σ of the numeric projection | 150 min singing/week | `Σ toNumber(e.value)` |
| `latest` | newest entry at or before window end | weight at end of week | `toNumber(last(entries).value)` |
| `mean` | `sum / count` (0 when count 0) | average session length | `Σ / n` |

The aggregate therefore lives on the **target**, not on the kind: a `duration` stream can be counted (days practised) *or* summed (minutes practised) with no duplicated data.

### 1.5 Entity-relationship diagram

```
                        ┌──────────────┐
                        │   settings   │   single row, id = 'singleton'
                        └──────────────┘

    ┌────────────┐ 1   n ┌──────────────┐ 1   n ┌─────────────────────┐
    │   goals    │───────│  activities  │───────│       entries       │
    │  (union    │       │ kind + role  │       │ value: union on kind│
    │   on type) │       │ defaultTarget│       │ date, loggedAt, note│
    └────────────┘       │ scheduling   │       └─────────────────────┘
      │   │   │          └──────────────┘                 ▲
      │   │   │                  ▲                        │ entryId
      │   │   │      activityId  │                        │ (completion ↔ undo)
      │   │   │                  │                        │
      │   │   │ 1  n ┌───────────┴──────┐                 │
      │   │   └──────│   weeklyPlans    │  targets: WeeklyTarget[] → activityId
      │   │          │ &[goalId+weekStart]                 │
      │   │          └──────────────────┘                 │
      │   │ 1  n ┌──────────────┐                         │
      │   └──────│    tasks     │─────────────────────────┘
      │          │ date, status │  activityId?, milestoneId?, steps[]
      │          └──────────────┘
      │ 1  n ┌──────────────┐
      └──────│  milestones  │  order, weight, targetDate?, status, targetValue?
             └──────────────┘

                        ┌──────────────┐
                        │     meta     │  key = 'schema' | 'lastImport'
                        │    trash     │  one row per deleted goal, 30-day TTL
                        └──────────────┘
```

### 1.6 Adding a new tracking kind later, without a migration

Say V1.3 adds `checklist` (§12: "extensible for future types"). The complete change set:

1. **`src/domain/types.ts`** — add `| 'checklist'` to `TrackKind`, add one member to the `TrackEntry` union:
   ```ts
   | (TrackEntryBase & { kind: 'checklist'; value: { items: { label: string; done: boolean }[] } })
   ```
2. **`src/domain/trackKinds.ts`** — register one adapter object:
   ```ts
   checklist: {
     kind: 'checklist',
     label: 'Checklist',
     defaultAggregate: 'sum',
     toNumber: v => v.items.filter(i => i.done).length,
     emptyValue: () => ({ items: [] }),
     format: (v, a) => `${v.items.filter(i => i.done).length}/${v.items.length}`,
   }
   ```
3. **`src/ui/track/ChecklistEditor.tsx`** — the input control, wired through `EDITORS[kind]`.

**Unchanged:** `DB_VERSION`, every object store, every keyPath, every index, every record already on disk. Nothing is rewritten, because everything kind-specific lives inside the *un-indexed* `value` blob while every *indexed* column (`id`, `goalId`, `activityId`, `date`, `loggedAt`) is kind-agnostic. `SCHEMA_VERSION` is bumped only if we want older builds to *refuse* the new export file; for a purely additive kind, we do not.

**Forward-compatibility rule (enforced in code):** `adapterFor(kind)` returns `undefined` for an unknown kind. The UI then renders a neutral "This entry type isn't supported by this version" row, and export round-trips the record unchanged. An older build importing a newer backup degrades gracefully instead of crashing or silently dropping data.

---

## 2. Dates and time

### 2.1 Representation

| Concept | Type | Example | Why |
|---|---|---|---|
| Calendar day | `LocalDate` = branded `'YYYY-MM-DD'` | `'2026-09-19'` | sorts chronologically, valid IDB key, DST-proof, readable in backups |
| Week identity | `LocalDate` of the week's first day | `'2026-09-14'` | unambiguous under any week-start setting |
| Month identity | `'YYYY-MM'` string (derived, never stored) | `'2026-09'` | §10 groups weeks by month |
| Instant | `Millis` = `number` (epoch ms, UTC) | `1789123456789` | `createdAt`, `updatedAt`, `loggedAt`, `completedAt` |
| Duration | `number` of **minutes** | `30` | §11 "30 min"; integer minutes avoid float noise |

`loggedAt` (instant) and `date` (calendar day) are **both** stored on every entry and are deliberately independent: a user can log Tuesday's workout on Wednesday morning, or backdate a weigh-in. `date` decides which week/day it counts for; `loggedAt` orders the audit trail.

### 2.2 Timezone / DST safety

All calendar arithmetic is done in **UTC on a date-only value**, which makes it structurally impossible for a DST transition to shift a result. Local time is read in exactly one function, `todayLocal()`.

```ts
// src/domain/date.ts
const p2 = (n: number) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function asLocalDate(s: string): LocalDate {
  if (!DATE_RE.test(s)) throw new RangeError(`Invalid LocalDate: ${s}`);
  return s as LocalDate;
}

/** The only place local wall-clock time is read. */
export function todayLocal(now: Date = new Date(), rolloverHour = 0): LocalDate {
  const t = new Date(now.getTime() - rolloverHour * 3_600_000);
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}` as LocalDate;
}

function toUTC(d: LocalDate): Date {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}
function fromUTC(t: Date): LocalDate {
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}` as LocalDate;
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const t = toUTC(d); t.setUTCDate(t.getUTCDate() + n); return fromUTC(t);
}
export function diffDays(a: LocalDate, b: LocalDate): number {   // b - a, in whole days
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}
export function startOfWeek(d: LocalDate, weekStartsOn: WeekStart): LocalDate {
  const delta = (toUTC(d).getUTCDay() - weekStartsOn + 7) % 7;   // getUTCDay: 0=Sun
  return addDays(d, -delta);
}
export function endOfWeek(d: LocalDate, w: WeekStart): LocalDate {
  return addDays(startOfWeek(d, w), 6);
}
export function weekRange(weekStart: LocalDate): readonly [LocalDate, LocalDate] {
  return [weekStart, addDays(weekStart, 6)] as const;
}
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;                                    // string <= comparison is valid for YYYY-MM-DD
}
export function monthKey(d: LocalDate): string { return d.slice(0, 7); }
export function isoWeekLabel(d: LocalDate): string {              // DISPLAY ONLY (§10 headers)
  const t = toUTC(d);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));        // Thursday of this ISO week
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${p2(week)}`;
}

export function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}
export function daysInMonth(y: number, m: number /* 1-12 */): number {
  return new Date(y, m, 0).getDate();              // day 0 of next month = last of this
}
export function firstDayOfMonth(monthKeyStr: string /* 'YYYY-MM' */): LocalDate {
  return asLocalDate(`${monthKeyStr}-01`);
}
export function lastDayOfMonth(monthKeyStr: string): LocalDate {
  const [y, m] = monthKeyStr.split('-').map(Number);
  return asLocalDate(`${monthKeyStr}-${String(daysInMonth(y, m)).padStart(2, '0')}`);
}
/** Clamps to the last valid day: '2027-01-31' +1m => '2027-02-28'; '2028-01-31' +1m => '2028-02-29'. */
export function addMonthsClamped(d: LocalDate, n: number): LocalDate {
  const [y0, m0, day] = [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))];
  const target = m0 - 1 + n;
  const y = y0 + Math.floor(target / 12);
  const m = ((target % 12) + 12) % 12 + 1;
  return asLocalDate(`${String(y).padStart(4, '0')}-${p2(m)}-${p2(Math.min(day, daysInMonth(y, m)))}`);
}
export function monthsBetween(a: LocalDate, b: LocalDate): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12
       + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}
export function clampDate(d: LocalDate, min: LocalDate, max: LocalDate): LocalDate {
  return d < min ? min : d > max ? max : d;
}

/* Display formatting — all via Intl, never a date library. */
const fmt = (opts: Intl.DateTimeFormatOptions) => (d: LocalDate) =>
  new Intl.DateTimeFormat(undefined, opts).format(toUTC(d));

export const formatDay = fmt({ weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });        // "Thu, 19 Sep"
export const formatFullDate = fmt({ day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });     // "19 September 2026"
export const formatMonthYear = fmt({ month: 'long', year: 'numeric', timeZone: 'UTC' });                    // "September 2026"

export function formatWeekRange(weekStart: LocalDate, weekStartsOn: WeekStart): string {
  const end = endOfWeek(weekStart, weekStartsOn);
  const short = (d: LocalDate) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toUTC(d));
  return `${short(weekStart)} – ${short(end)}`;                  // "14 – 20 Sep"; "28 Sep – 4 Oct" across months
}
export function formatRelativeDay(d: LocalDate, today: LocalDate): string {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  if (d === addDays(today, -1)) return 'Yesterday';
  return formatDay(d);
}

/** Next LOCAL midnight after `now`, for a self-rescheduling ticker (see useToday, EDGE-CASES.md §A). */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1_000, next.getTime() - now.getTime());
}
```

`eachDay` relies on `'2026-09-19' <= '2026-09-20'` — true for zero-padded ISO dates, which is exactly why the format was chosen.

### 2.3 Week start — configurable, snapshotted

`Settings.weekStartsOn: 0 | 1` (0 = Sunday, 1 = Monday). **Default `1` (Monday)**, matching §10's "Week 1 / Week 2" framing and the ISO convention.

Every `WeeklyPlan` stores `weekStartsOn` as a **snapshot of the setting at creation time**. If the user later flips Monday → Sunday, existing plan rows still describe the seven days they were actually built for; new weeks use the new setting. The boundary case (an in-flight goal whose weeks change shape) is a genuine edge case and is handed to the edge-cases dimension — the *data* is already unambiguous because each row carries its own definition.

### 2.4 Day rollover

`Settings.dayRolloverHour: 0..6`, default `0`. Logging a workout at 00:30 with rollover 3 files it under the previous calendar day. One number, one subtraction in `todayLocal()`, and it removes the single most annoying daily-tracker bug. Only "what is today" uses it; stored dates are always plain calendar dates.

---

## 3. `src/domain/types.ts` — complete source

```ts
/**
 * src/domain/types.ts
 * Single source of truth for every persisted shape.
 * No imports, no runtime code except newId/typed helpers — this file must be
 * usable from Node tests and from a future web worker without pulling in Dexie.
 */

/* ────────────────────────── branded primitives ────────────────────────── */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Calendar day in the user's local timezone: 'YYYY-MM-DD'. Sorts chronologically. */
export type LocalDate = Brand<string, 'LocalDate'>;
/** Epoch milliseconds, UTC. Plain number so arithmetic stays ergonomic. */
export type Millis = number;

export type GoalId       = Brand<string, 'GoalId'>;
export type ActivityId   = Brand<string, 'ActivityId'>;
export type MilestoneId  = Brand<string, 'MilestoneId'>;
export type WeeklyPlanId = Brand<string, 'WeeklyPlanId'>;
export type TaskId       = Brand<string, 'TaskId'>;
export type EntryId      = Brand<string, 'EntryId'>;
export type StepId       = Brand<string, 'StepId'>;

/** UUIDv4. crypto.randomUUID exists in every secure context (PWA => HTTPS/localhost, §18);
 *  the fallback covers plain-http LAN testing on a phone. */
export function newId<T extends string = string>(): T {
  const c: Crypto | undefined = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID() as T;
  const b = new Uint8Array(16);
  c!.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;           // version 4
  b[8] = (b[8] & 0x3f) | 0x80;           // variant 10
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}` as T;
}

export interface Entity {
  createdAt: Millis;
  updatedAt: Millis;
}

/* ───────────────────────────── settings ───────────────────────────── */

export type WeekStart = 0 | 1;                       // 0 = Sunday, 1 = Monday
export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings extends Entity {
  id: 'singleton';
  /** §10 week grouping; snapshotted onto every WeeklyPlan. Default 1 (Monday). */
  weekStartsOn: WeekStart;
  /** 0..6. "Today" ends N hours after midnight. Default 0. */
  dayRolloverHour: number;
  theme: ThemePref;
  /**
   * BOTH the live display unit for every metric/duration activity's chart and
   * "Current: X" readout (a pure read-time formatting choice, see TrackEntry above)
   * AND the default offered when creating a new activity. Changing this writes
   * zero rows — see `formatEntry()` in `src/domain/units.ts`.
   */
  displayUnits: { weight: DisplayUnit; distance: DisplayUnit; duration: DisplayUnit; currency: string };
  /** §15 export/import support. */
  lastBackupAt: Millis | null;
  /** Days between backup nudges; 0 disables. Default 14. */
  backupReminderDays: number;
  onboardedAt: Millis | null;
  /** Mirrors meta.schema.schemaVersion; convenient for the export writer. */
  schemaVersion: number;
}

/* ────────────────────────────── goals ────────────────────────────── */

export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';   // §8

/** Stored token, not a hex value. The visualization dimension owns the palette. */
export type GoalColor = 'slate' | 'blue' | 'teal' | 'green' | 'amber' | 'rose' | 'violet';

/**
 * §2 specifies "Deadline: March 2027" — month precision, not a fabricated day.
 * Storing a synthesized day (e.g. '2027-03-01') would silently lose ~30 days of
 * runway and display a date the user never entered. Month precision resolves to
 * the LAST day of that month everywhere math needs a concrete date — generous,
 * and it matches how a person means "by the end of March".
 */
export type Deadline =
  | { precision: 'month'; value: string }    // 'YYYY-MM', e.g. '2027-03'
  | { precision: 'day'; value: LocalDate };

export function resolveDeadline(d: Deadline): LocalDate {
  if (d.precision === 'day') return d.value;
  const [y, m] = d.value.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();             // day 0 of next month = last of this
  return asLocalDate(`${d.value}-${String(lastDay).padStart(2, '0')}`);
}

/** A closed-or-open pause window. `to: null` means "still paused". Inclusive both ends. */
export interface PauseInterval {
  from: LocalDate;
  to: LocalDate | null;
}

export interface GoalBase extends Entity {
  id: GoalId;
  name: string;                       // 'Fitness'
  description?: string;
  status: GoalStatus;
  startDate: LocalDate;
  /** null only for open-ended habit goals; every other type requires one (§4). */
  deadline: Deadline | null;
  /**
   * Ordered, non-overlapping, at most one entry with `to: null` (INV-G3, EDGE-CASES.md §B).
   * Needed so a past day can be told apart from "missed": a task pending inside a pause
   * window must never be counted against the user (§5), which requires knowing WHEN a
   * pause happened, not just that the goal is *currently* paused.
   */
  pauses: PauseInterval[];
  /** Manual ordering on the Goals screen (§8). Sparse: 0, 100, 200 … */
  sortOrder: number;
  color: GoalColor;
  icon?: string;                      // single emoji or icon key
  completedAt: Millis | null;
  archivedAt: Millis | null;
}

export interface MetricGoalConfig {
  direction: 'increase' | 'decrease'; // 43→50 kg = increase; 90→80 kg = decrease
  startValue: number;                 // value at startDate — user intent, stored
  targetValue: number;
  /** Free text, NOT the strict CanonicalUnit enum — this is a display label for the
   *  goal's target framing ('kg', 'km', '$'), decoupled from the outcome activity's
   *  canonical storage. A savings goal uses unit='count' on its outcome activity
   *  (currency is deferred; see EDGE-CASES.md §L). */
  unit: string;                       // 'kg' | 'km' | 'USD' | free text
  decimals: 0 | 1 | 2;
  /** §4 "realistic target ranges": safe pace bounds in unit/week. Planner clamps to this. */
  paceBand: { minPerWeek: number; maxPerWeek: number } | null;
}

export interface HabitGoalConfig {
  /** Habit goals may legitimately have no end. */
  horizon: 'ongoing' | 'until-deadline';
}

export interface SkillGoalConfig {
  currentLevel: string;               // 'Beginner'
  targetOutcome: string;              // 'Sing 3 songs on pitch'
  /** Optional ordered ladder; when present, progress = index(current)/(len-1). */
  levelScale: string[] | null;
}

export interface ProjectGoalConfig {
  /** 'equal' ignores Milestone.weight; 'manual' honours it. */
  milestoneWeighting: 'equal' | 'manual';
}

export type Goal =
  | (GoalBase & { type: 'metric';  config: MetricGoalConfig })
  | (GoalBase & { type: 'habit';   config: HabitGoalConfig })
  | (GoalBase & { type: 'skill';   config: SkillGoalConfig })
  | (GoalBase & { type: 'project'; config: ProjectGoalConfig });

export type GoalType = Goal['type'];
export type GoalOf<T extends GoalType> = Extract<Goal, { type: T }>;

/* ──────────────────────────── activities ──────────────────────────── */

/** §12. Open for extension: adding a member touches no store and no index. */
export type TrackKind = 'metric' | 'habit' | 'duration' | 'session';

/** 'outcome' = the result being moved (weight). 'input' = the work that moves it (workouts). */
export type ActivityRole = 'outcome' | 'input';

export type TargetAggregate = 'count' | 'sum' | 'latest' | 'mean';

export interface ActivityTarget {
  aggregate: TargetAggregate;
  /** Target per week, in the activity's unit — or a plain entry count when aggregate = 'count'. */
  amount: number;
  /** §4: suggestions, not predictions. When set, the UI shows "3–4" instead of "3". */
  band: { min: number; max: number } | null;
  /** Only meaningful for 'latest' / 'mean'. Default 'gte'. */
  compare: 'gte' | 'lte' | null;
}

export type ActivityScheduling =
  /** N generated tasks per week, spread across preferred days. */
  | { mode: 'daysPerWeek'; daysPerWeek: number; preferredDays: number[];
      defaultMinutes: number | null; stepTemplate: StepTemplate[] }
  /** Exactly these weekdays every week (0 = Sunday). */
  | { mode: 'fixedDays'; days: number[]; defaultMinutes: number | null; stepTemplate: StepTemplate[] }
  /** Tracked, but never generates daily tasks (e.g. an ad-hoc weigh-in). */
  | { mode: 'none' };

export interface StepTemplate { title: string; minutes: number | null }

/**
 * A metric/duration activity's unit is fixed to one CANONICAL unit for life. This is
 * what makes unit switching (kg <-> lb) a display-only setting rather than a data
 * migration — see `src/domain/units.ts` below and TrackEntry's value shape.
 */
export type CanonicalUnit = 'kg' | 'km' | 'min' | 'count';
export type DisplayUnit = 'kg' | 'lb' | 'km' | 'mi' | 'min' | 'h' | 'count';

export interface Activity extends Entity {
  id: ActivityId;
  goalId: GoalId;
  name: string;                       // 'Workout', 'Weight', 'Practice'
  kind: TrackKind;
  role: ActivityRole;
  /** Canonical unit for metric/duration activities; null for habit/session. Fixed at creation. */
  unit: CanonicalUnit | null;
  decimals: 0 | 1 | 2;
  /** Seed for every generated WeeklyPlan; null = tracked but untargeted. */
  defaultTarget: ActivityTarget | null;
  scheduling: ActivityScheduling;
  color: GoalColor | null;            // null = inherit the goal's colour
  sortOrder: number;
  /** Hide from entry UI without destroying history. NOT indexed (booleans aren't IDB keys). */
  archived: boolean;
}

/* ──────────────────────────── milestones ──────────────────────────── */

export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export interface Milestone extends Entity {
  id: MilestoneId;
  goalId: GoalId;
  title: string;                      // 'Basic chords'
  description?: string;
  /** Nullable => deliberately NOT indexed. */
  targetDate: LocalDate | null;
  status: MilestoneStatus;
  completedAt: Millis | null;
  /** Dense 0..n-1 within a goal; rewritten on reorder. */
  order: number;
  /** Relative weight for project progress; 1 unless milestoneWeighting = 'manual'. */
  weight: number;
  /** Metric goals: the value this checkpoint represents, e.g. 45 kg by June. */
  targetValue: number | null;
  source: 'generated' | 'user';
}

/* ─────────────────────────── weekly plans ─────────────────────────── */

export interface WeeklyTarget {
  activityId: ActivityId;
  aggregate: TargetAggregate;
  amount: number;
  band: { min: number; max: number } | null;
}

export interface WeeklyPlan extends Entity {
  id: WeeklyPlanId;
  goalId: GoalId;
  /** Canonical week key: the first day of the week. Unique with goalId. */
  weekStart: LocalDate;
  /** Snapshot of Settings.weekStartsOn when this row was created. */
  weekStartsOn: WeekStart;
  targets: WeeklyTarget[];
  /** Metric goals only (§4): suggested value range at week end. null otherwise. */
  outcomeBand: { min: number; max: number } | null;
  /** Provenance drives the Plan screen badge and whether re-plan may overwrite it. */
  source: 'generated' | 'edited' | 'replanned';
  /** Idempotency guard for daily-task generation; null = not yet generated. */
  tasksGeneratedAt: Millis | null;
  note?: string;
  /** NOTE: no `actuals` field — actuals are always derived from `entries`. See §0. */
}

/* ──────────────────────────── daily tasks ──────────────────────────── */

export type TaskStatus = 'pending' | 'done' | 'skipped';   // §11

export interface TaskStep {
  id: StepId;
  title: string;                      // 'Breathing'
  minutes: number | null;             // 5
  done: boolean;
}

export interface DailyTask extends Entity {
  id: TaskId;
  goalId: GoalId;
  activityId: ActivityId | null;      // null = a one-off task not tied to a stream
  milestoneId: MilestoneId | null;
  date: LocalDate;
  title: string;                      // 'Singing practice'
  plannedMinutes: number | null;      // 30
  status: TaskStatus;
  completedAt: Millis | null;
  steps: TaskStep[];                  // §11 sub-steps, embedded
  source: 'generated' | 'user';
  /** Set when rescheduled (§11) so planned-vs-actual stays honest. */
  originalDate: LocalDate | null;
  /** Entry created by completing this task; lets un-complete remove it cleanly. */
  entryId: EntryId | null;
  sortOrder: number;
}

/* ─────────────────────────── track entries ─────────────────────────── */

export interface TrackEntryBase extends Entity {
  id: EntryId;
  /** Denormalised from Activity so goal-scoped range queries need one index, not a join. */
  goalId: GoalId;
  activityId: ActivityId;
  /** Calendar day this entry counts for. User-editable; backdating is supported. */
  date: LocalDate;
  /** Wall-clock instant it was recorded. Orders multiple entries on the same day. */
  loggedAt: Millis;
  note?: string;
  taskId: TaskId | null;
  source: 'manual' | 'task' | 'import';
}

/**
 * All kind-specific data lives in `value` and `value` is never indexed.
 * That is the entire extensibility guarantee: new kinds need no migration.
 */
/**
 * `metric` and `duration` store BOTH the canonical number (always in the activity's
 * fixed `CanonicalUnit`, used by every formula in §3.2) AND the verbatim entry the
 * user actually typed (`entryValue`/`entryUnit`). Switching the display unit in
 * Settings is then a pure read-time formatting choice — see `formatEntry` below —
 * and NEVER rewrites a stored value. This is the fix for the classic kg<->lb
 * corruption trap: a convert-on-switch migration that half-fails, or that round-trips
 * 43.5 kg -> 95.9 lb -> 43.499999 kg, destroys history irreversibly. There is no
 * `convertAllEntries` function anywhere in this design, by design.
 */
export type TrackEntry =
  | (TrackEntryBase & { kind: 'metric';
      value: { n: number; entryValue: number; entryUnit: DisplayUnit } })
  | (TrackEntryBase & { kind: 'habit';    value: { done: true } })
  | (TrackEntryBase & { kind: 'duration';
      value: { minutes: number; entryValue: number; entryUnit: DisplayUnit } })
  | (TrackEntryBase & { kind: 'session';  value: { count: number; minutes: number | null;
                                                   intensity: 1 | 2 | 3 | null } });

export type TrackValue = TrackEntry['value'];
export type TrackEntryOf<K extends TrackKind> = Extract<TrackEntry, { kind: K }>;

/**
 * `src/domain/units.ts` — pure, no imports. The entire fix for the kg<->lb
 * corruption trap lives here, in ~25 lines.
 */
export const UNIT_TABLE: Record<DisplayUnit, { canonical: CanonicalUnit; factor: number; dp: number }> = {
  kg:    { canonical: 'kg',    factor: 1,          dp: 1 },
  lb:    { canonical: 'kg',    factor: 0.45359237, dp: 1 },  // exact by definition
  km:    { canonical: 'km',    factor: 1,          dp: 2 },
  mi:    { canonical: 'km',    factor: 1.609344,   dp: 2 },  // exact by definition
  min:   { canonical: 'min',   factor: 1,          dp: 0 },
  h:     { canonical: 'min',   factor: 60,         dp: 0 },
  count: { canonical: 'count', factor: 1,          dp: 0 },
};

// roundTo(v, dp) and nearlyEqual(a, b, eps) live in src/lib/num/round.ts (EDGE-CASES.md §C) —
// used here and by every float comparison in the app; plain `===` on floats is never used.
export function toCanonical(value: number, unit: DisplayUnit): number;    // roundTo(value * factor, 6)
export function fromCanonical(value: number, unit: DisplayUnit): number;  // value / factor
export function compatible(a: DisplayUnit, b: DisplayUnit): boolean;      // same canonical bucket

/**
 * If the entry's own unit matches the requested display unit, print the verbatim
 * `entryValue`/`entryUnit` — byte-identical to what the user typed, forever.
 * Otherwise convert the canonical value at read time. No stored value is ever touched.
 */
export function formatEntry(
  v: { n: number; entryValue: number; entryUnit: DisplayUnit },
  display: DisplayUnit,
): string {
  if (v.entryUnit === display) return `${v.entryValue} ${display}`;
  const dp = UNIT_TABLE[display].dp;
  return `${roundTo(fromCanonical(v.n, display), dp)} ${display}`;
}

/* A habit entry exists only when the habit was done — absence means not done.
   `{ done: true }` keeps the union discriminable and the export file self-describing.
   "Skipped" is a property of the TASK, never of an entry. */

/* ──────────────────────────────── meta ──────────────────────────────── */

export interface GoalSubtree {
  goal: Goal;
  activities: Activity[];
  milestones: Milestone[];
  weeklyPlans: WeeklyPlan[];
  tasks: DailyTask[];
  entries: TrackEntry[];
}

export type MetaRecord =
  | { key: 'schema'; schemaVersion: number; dbVersion: number; installedAt: Millis }
  | { key: 'lastImport'; at: Millis; mode: 'replace' | 'merge'; counts: Record<string, number> };

export type MetaKey = MetaRecord['key'];

/**
 * A 30-day recoverable-delete record. One row per deleted goal — unlike a single
 * `meta` slot, deleting goal B does not destroy A's undo, and "Recently deleted"
 * (§8) can list more than one item. Purged by `purgeExpiredTrash()`, run at boot.
 */
export interface TrashEntry {
  id: string;                // new id for the trash row itself, not the goal's id
  goalName: string;          // for the "Recently deleted" list without restoring first
  deletedAt: Millis;
  expiresAt: Millis;         // deletedAt + 30 days
  payload: GoalSubtree;
}

/* ─────────────────────────── export document ─────────────────────────── */

export interface ExportDoc {
  format: 'goal-backward-planner';
  schemaVersion: number;
  /** ISO 8601 with offset, e.g. '2026-09-19T21:04:11+07:00'. Informational only. */
  exportedAt: string;
  appVersion: string;
  counts: Record<Exclude<StoreName, 'meta'>, number>;
  data: {
    settings: Settings;
    goals: Goal[];
    activities: Activity[];
    milestones: Milestone[];
    weeklyPlans: WeeklyPlan[];
    tasks: DailyTask[];
    entries: TrackEntry[];
  };
}

export type StoreName =
  | 'settings' | 'goals' | 'activities' | 'milestones'
  | 'weeklyPlans' | 'tasks' | 'entries' | 'meta' | 'trash';

/* ───────────────────── derived (never persisted) ───────────────────── */

export type TrackStatus = 'ahead' | 'on_track' | 'behind' | 'no_target';

export interface WeekActivityRow {
  activityId: ActivityId;
  name: string;
  kind: TrackKind;
  aggregate: TargetAggregate;
  unit: string | null;
  target: number | null;
  band: { min: number; max: number } | null;
  actual: number;
  status: TrackStatus;
}

export interface WeekSummary {
  goalId: GoalId;
  weekStart: LocalDate;
  rows: WeekActivityRow[];
  /** Σ min(actual, target) / Σ target across targeted input rows; null when no targets. */
  adherence: number | null;
  status: TrackStatus;
}

export interface GoalProgress {
  goalId: GoalId;
  /** 0..1, or null when the goal type has no meaningful completion ratio. */
  ratio: number | null;
  /** §9 'Current: 43.5 kg' — derived from the outcome activity's latest entry. */
  currentValue: number | null;
  targetValue: number | null;
  unit: string | null;
  milestonesDone: number;
  milestonesTotal: number;
  daysRemaining: number | null;
  currentMilestone: Milestone | null;
}
```

### 3.1 Track-kind adapter registry (`src/domain/trackKinds.ts`)

```ts
export interface TrackKindAdapter<K extends TrackKind = TrackKind> {
  kind: K;
  label: string;
  /** Aggregate suggested when an activity of this kind is created. */
  defaultAggregate: TargetAggregate;
  /** Numeric projection used by 'sum' / 'latest' / 'mean'. */
  toNumber(v: TrackEntryOf<K>['value']): number;
  emptyValue(a: Activity): TrackEntryOf<K>['value'];
  /** For 'metric'/'duration', delegates to `formatEntry()` (§3 above) with the display unit. */
  format(v: TrackEntryOf<K>['value'], a: Activity, display: DisplayUnit): string;
  validate(v: unknown): v is TrackEntryOf<K>['value'];
}

export const TRACK_KINDS: { [K in TrackKind]: TrackKindAdapter<K> } = { /* … */ };

/** Returns undefined for kinds this build does not know — see forward-compat rule. */
export function adapterFor(kind: string): TrackKindAdapter | undefined;
```

`toNumber` by kind: `metric → value.n`, `habit → 1`, `duration → value.minutes`, `session → value.count` — always the canonical number, never `entryValue`.

### 3.2 Aggregation and progress formulas (`src/domain/progress.ts`)

Pure, array-in / value-out, no IndexedDB.

```ts
export function aggregate(entries: TrackEntry[], agg: TargetAggregate): number;
export function summarizeWeek(args: {
  goal: Goal; activities: Activity[]; plan: WeeklyPlan | null;
  entries: TrackEntry[];            // already range-filtered to the week
  weekStart: LocalDate; today: LocalDate; weekStartsOn: WeekStart;
}): WeekSummary;
export function goalProgress(args: {
  goal: Goal; activities: Activity[]; milestones: Milestone[];
  latestOutcomeEntry: TrackEntry | null; today: LocalDate;
}): GoalProgress;
```

* `aggregate`: `count → entries.length`; `sum → Σ toNumber`; `latest → toNumber(maxBy(e => [e.date, e.loggedAt]))` (0 when empty); `mean → sum / count` (0 when empty).
* **Metric goal ratio** — sign-agnostic, so it works for both directions:
  `ratio = clamp01((current − startValue) / (targetValue − startValue))`, and `null` when `targetValue === startValue`.
  Fitness sanity check: `(43.5 − 43) / (50 − 43) = 0.0714 → 7%`, matching §8 exactly.
* **Skill / project ratio** = `Σ weight(done) / Σ weight(all)`; `weight` is forced to 1 when `milestoneWeighting === 'equal'`. Skill goals with a `levelScale` instead use `indexOf(currentLevel) / (levelScale.length − 1)`.
* **Habit goal ratio** = `null`. A goal with no end state has no percentage; §13 shows trailing-4-week adherence instead. Showing a fake "%" here would be the kind of false precision §4 forbids.
* **Week adherence** = `Σ min(actual, target) / Σ target` over input rows with a target (`null` when there are none). Capped per-row so one heroic activity cannot mask a neglected one.
* **Row status** (proposed default; the planning-engine dimension owns final thresholds):
  `expected = (diffDays(weekStart, min(today, weekEnd)) + 1) / 7`, `ratio = actual / target`;
  `behind` when `ratio < expected − 0.25`, `ahead` when `ratio ≥ 1` and today is before the week end, else `on_track`.
  Wording stays factual (§5): the UI renders "1 of 3 planned workouts", never "failed".
* **Outcome band** (proposed; planning-engine may tune `k = 2`) — a random-walk widening band, so the promise stays a range and never a prediction (§4):
  `expected(i) = startValue + (targetValue − startValue) × i / totalWeeks`
  `halfWidth(i) = max(unitStep, k × √i × |weeklyDelta|)` where `weeklyDelta = (targetValue − startValue)/totalWeeks`, `unitStep = 10^(−decimals)`
  Fitness at week 10 of 78: `weeklyDelta = 0.0897`, `halfWidth = 2 × 3.162 × 0.0897 = 0.57 kg` → band `43.90 … 45.04 kg`. Honest, and visibly a range.

---

## 4. IndexedDB schema

### 4.1 Library choice — Dexie 4 (committed)

| | Dexie 4 | `idb` | raw IndexedDB |
|---|---|---|---|
| Size (min+gzip) | ≈27 kB | ≈1.5 kB | 0 |
| Versioned migrations | declarative `.version(n).stores().upgrade()` | hand-written `onupgradeneeded` switch | same, worse |
| Live queries | `useLiveQuery` built in | none — we build a pub/sub | none |
| Compound index ranges | `where('[goalId+date]').between(...)` | manual `IDBKeyRange` tuples | manual |
| Transactions | `db.transaction('rw', …)` with auto-commit safety | manual | manual |

Chosen: **Dexie 4** with `dexie-react-hooks`. The whole app is a reactive view over local tables; `useLiveQuery` means completing a task in `TaskRow.tsx` updates the Today header, the week strip and the goal card with zero invalidation code. The 25 kB is smaller than the cache layer we would otherwise write, and migration ergonomics are the difference between a safe upgrade and a scary one. (Measure the real number at build time with `npx vite-bundle-visualizer`.)

Total runtime dependency budget for this dimension: **`dexie` + `dexie-react-hooks`. Nothing else.** No date library — §2.2 is 60 lines and fully tested.

### 4.2 Store definitions

```ts
// src/data/db.ts
import Dexie, { type Table } from 'dexie';
import type { /* … */ } from '../domain/types';

export const DB_NAME = 'goal-planner';
export const DB_VERSION = 1;        // IndexedDB structural version
export const SCHEMA_VERSION = 1;    // logical record-shape version (also written to exports)

export class GoalDB extends Dexie {
  settings!:    Table<Settings, 'singleton'>;
  goals!:       Table<Goal, GoalId>;
  activities!:  Table<Activity, ActivityId>;
  milestones!:  Table<Milestone, MilestoneId>;
  weeklyPlans!: Table<WeeklyPlan, WeeklyPlanId>;
  tasks!:       Table<DailyTask, TaskId>;
  entries!:     Table<TrackEntry, EntryId>;
  meta!:        Table<MetaRecord, MetaKey>;
  trash!:       Table<TrashEntry, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      settings:    'id',
      goals:       'id, status, [status+sortOrder], updatedAt',
      activities:  'id, goalId, [goalId+sortOrder]',
      milestones:  'id, goalId, [goalId+order]',
      weeklyPlans: 'id, goalId, weekStart, &[goalId+weekStart]',
      tasks:       'id, date, goalId, [date+sortOrder], [goalId+date]',
      entries:     'id, date, goalId, activityId, [activityId+date], [goalId+date], loggedAt',
      meta:        'key',
      trash:       'id, expiresAt, deletedAt',
    });
  }
}

/** Lazy singleton. MUST never be evaluated during SSR (see §4.6). */
let _db: GoalDB | null = null;
export function getDb(): GoalDB {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable (SSR or blocked)');
  return (_db ??= new GoalDB());
}
```

In Dexie's schema string the **first** token is the keyPath; the rest are indexes; `[a+b]` is compound; `&` means unique. Un-listed properties are stored but not indexed — which is exactly what we want for `config`, `value`, `steps` and `targets`.

### 4.3 Every index, and the query that justifies it

| Store | Index | Serves (spec ref) | Dexie call |
|---|---|---|---|
| `settings` | *(keyPath `id`)* | load settings once at boot | `db.settings.get('singleton')` |
| `goals` | `[status+sortOrder]` | §8 Goals screen: active goals in user order | `db.goals.where('[status+sortOrder]').between(['active',Dexie.minKey],['active',Dexie.maxKey]).toArray()` |
| `goals` | `status` | counts per status; the Archive list | `db.goals.where('status').equals('archived').toArray()` |
| `goals` | `updatedAt` | "Recently updated" ordering in the More screen; export ordering | `db.goals.orderBy('updatedAt').reverse()` |
| `activities` | `[goalId+sortOrder]` | §9 goal detail: this goal's streams in order | `db.activities.where('[goalId+sortOrder]').between([g,Dexie.minKey],[g,Dexie.maxKey])` |
| `activities` | `goalId` | cascade delete; "all activities for N goals" on Today | `db.activities.where('goalId').anyOf(goalIds)` |
| `milestones` | `[goalId+order]` | §9 milestone list, ordered; "current milestone" = first not-done | `db.milestones.where('[goalId+order]').between([g,Dexie.minKey],[g,Dexie.maxKey])` |
| `milestones` | `goalId` | cascade delete | `db.milestones.where('goalId').equals(g).delete()` |
| `weeklyPlans` | `&[goalId+weekStart]` | §9/§7 this week's plan for a goal — **and enforces one plan per goal-week** | `db.weeklyPlans.get({ goalId, weekStart })` |
| `weeklyPlans` | `weekStart` | §10 Plan screen: every goal's plan for a month of weeks | `db.weeklyPlans.where('weekStart').between(w0,w5,true,true)` |
| `weeklyPlans` | `goalId` | cascade delete; goal-history view | `db.weeklyPlans.where('goalId').equals(g)` |
| `tasks` | `[date+sortOrder]` | **§7 Today screen** — today's tasks in display order, one index hit | `db.tasks.where('[date+sortOrder]').between([d,Dexie.minKey],[d,Dexie.maxKey])` |
| `tasks` | `date` | week strip / 7-day task counts | `db.tasks.where('date').between(ws,we,true,true)` |
| `tasks` | `[goalId+date]` | §9 goal detail: this goal's tasks this week | `db.tasks.where('[goalId+date]').between([g,ws],[g,we],true,true)` |
| `tasks` | `goalId` | cascade delete | `db.tasks.where('goalId').equals(g).delete()` |
| `entries` | `[goalId+date]` | §7/§9 **this week's actuals per goal** — the hottest query in the app | `db.entries.where('[goalId+date]').between([g,ws],[g,we],true,true)` |
| `entries` | `[activityId+date]` | §13 metric line chart over a range; habit heat-map for one stream | `db.entries.where('[activityId+date]').between([a,from],[a,to],true,true)` |
| `entries` | `activityId` | latest outcome value (`.reverse().first()` after ordering); cascade on activity delete | `db.entries.where('[activityId+date]').between([a,Dexie.minKey],[a,Dexie.maxKey]).last()` |
| `entries` | `date` | cross-goal "recent activity" / global heat-map | `db.entries.where('date').between(from,to,true,true)` |
| `entries` | `goalId` | cascade delete | `db.entries.where('goalId').equals(g).delete()` |
| `entries` | `loggedAt` | audit ordering for same-day entries; import dedupe | `db.entries.orderBy('loggedAt').reverse().limit(20)` |
| `meta` | *(keyPath `key`)* | schema record, last import summary | `db.meta.get('schema')` |
| `trash` | `expiresAt` | 30-day purge sweep at boot | `db.trash.where('expiresAt').below(now).delete()` |
| `trash` | `deletedAt` | "Recently deleted" list (§8), most-recent-first | `db.trash.orderBy('deletedAt').reverse()` |

**Deliberately NOT indexed, and why**

| Field | Reason |
|---|---|
| `milestones.targetDate` | nullable — records with `null` would be *silently missing* from the index. A goal has ~3–15 milestones; "upcoming milestones" sorts the already-loaded array in memory. |
| `activities.archived`, `tasks.steps[].done` | `boolean` is not a valid IndexedDB key. Filter in memory. |
| `tasks.status` | Today must show *all* of today's tasks including completed ones (§7 checkboxes), so `date` alone is the right key; status is filtered in memory over ≤ ~15 rows. |
| `goals.deadline` | nullable for habit goals; and there are never enough goals for an index to matter. |
| `goal.config.*`, `entry.value.*`, `plan.targets[]` | nested per-type payloads — never queried by, and keeping them unindexed is what makes new goal types / track kinds migration-free. |

### 4.4 The Today screen's full query plan (§7)

```
1. settings.get('singleton')                                      → weekStartsOn, dayRolloverHour
2. today = todayLocal(new Date(), dayRolloverHour)
   ws = startOfWeek(today, weekStartsOn); we = addDays(ws, 6)
3. goals: where('[status+sortOrder]') between ['active',min] .. ['active',max]        → G (≤ ~10)
4. activities: where('goalId').anyOf(G.map(id))                                       → A
5. weeklyPlans: where('weekStart').equals(ws) → filter to G                            → P (1 index hit)
6. entries: where('[goalId+date]') between [g,ws]..[g,we]   per goal                   → E (|G| hits)
7. tasks:   where('[date+sortOrder]') between [today,min]..[today,max]                 → T (1 hit)
8. summarizeWeek({...}) per goal            ← pure, in memory
```

Roughly `|G| + 4` index hits for the whole home screen, all against small ranges. At the realistic scale of §5.6 this is sub-millisecond; no caching layer is needed beyond `useLiveQuery`'s own.

### 4.5 Repository layer

`src/data/repo/` — the only module allowed to import `getDb()`:

```ts
// goals.repo.ts
export async function createGoal(input: NewGoalInput): Promise<GoalId>;   // goal + activities + milestones in ONE rw txn
export async function updateGoal(id: GoalId, patch: Partial<GoalBase> | { config: unknown }): Promise<void>;
export async function setGoalStatus(id: GoalId, status: GoalStatus): Promise<void>;
export async function deleteGoalCascade(id: GoalId): Promise<GoalSubtree>; // returns the snapshot it stored
export async function undoLastGoalDelete(): Promise<GoalId | null>;

// entries.repo.ts
export async function logEntry(input: NewEntryInput): Promise<EntryId>;
export async function editEntry(id: EntryId, patch: Partial<TrackEntryBase> & { value?: TrackValue }): Promise<void>;
export async function deleteEntry(id: EntryId): Promise<void>;            // also clears task.entryId
export async function entriesForWeek(goalId: GoalId, weekStart: LocalDate): Promise<TrackEntry[]>;
export async function entriesForActivity(activityId: ActivityId, from: LocalDate, to: LocalDate): Promise<TrackEntry[]>;
export async function latestEntry(activityId: ActivityId): Promise<TrackEntry | undefined>;

// tasks.repo.ts
export async function completeTask(id: TaskId): Promise<void>;   // sets status/completedAt AND writes the linked entry
export async function uncompleteTask(id: TaskId): Promise<void>; // reverses both, in one txn
export async function skipTask(id: TaskId): Promise<void>;       // status='skipped'; NO entry; never worded as failure (§5)
export async function rescheduleTask(id: TaskId, to: LocalDate): Promise<void>;  // sets originalDate once
```

Two invariants enforced here rather than in the UI:

* **`updatedAt` stamping** — a single `touch<T extends Entity>(rec: T): T` helper is applied in every write path.
* **Task ↔ entry atomicity** — `completeTask` writes the `DailyTask` and its `TrackEntry` in one `rw` transaction and stores `task.entryId`. `uncompleteTask` deletes exactly that entry. A user who ticks and un-ticks a checkbox five times leaves zero orphan entries. Manual entries (`source: 'manual'`) are never touched by task state.

### 4.6 Next.js / SSR note

Dexie must never be constructed on the server. `getDb()` is lazy and throws if `indexedDB` is undefined; every module that reaches the DB is under a `'use client'` boundary, and the data provider is imported via `next/dynamic` with `{ ssr: false }`. If the architecture dimension chooses Vite + React Router instead of Next (which I'd prefer for a pure client-side PWA — §14 names "React / Next.js" but requires no server), this constraint disappears and nothing else in this document changes.

### 4.7 Storage durability

```ts
// src/data/persistence.ts
export async function requestPersistence(): Promise<boolean>;   // navigator.storage.persist()
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null>;
```

`requestPersistence()` is called **after the user saves their first goal**, not on first paint — browsers weigh engagement, so the grant rate is far higher there, and a permission-ish prompt on a blank screen is hostile. Without persistence, Safari evicts IndexedDB for sites unused for 7 days; that, plus §15, is why `Settings.backupReminderDays` exists and defaults to 14. The nudge copy and placement belong to the ux dimension; the data layer only provides `lastBackupAt` and the estimate.

---

## 5. Versioning and migrations

### 5.1 Two numbers

| Constant | Where it lives | Bumped when | Consumed by |
|---|---|---|---|
| `DB_VERSION` | `src/data/db.ts` | a store, keyPath or index changes | Dexie `.version(n)` |
| `SCHEMA_VERSION` | `src/data/db.ts` | a persisted **record shape** changes (field added with a required default, renamed, re-typed, semantics changed) | `ExportDoc.schemaVersion`, `meta.schema`, import gate |

They are independent on purpose:

| Change | `DB_VERSION` | `SCHEMA_VERSION` |
|---|---|---|
| add index `entries.loggedAt` | +1 | — |
| add `Activity.reminderTime` with a default | — | +1 |
| add `TrackKind: 'checklist'` (additive) | — | — |
| rename `WeeklyPlan.note → WeeklyPlan.comment` | — | +1 |
| split `tasks` into two stores | +1 | +1 |

V1 ships `DB_VERSION = 1`, `SCHEMA_VERSION = 1`.

### 5.2 One migration definition, two consumers

```ts
// src/data/migrations.ts
import type { StoreName } from '../domain/types';

export type RecordMigrator = (rec: any) => any;

export interface SchemaMigration {
  to: number;                                            // resulting SCHEMA_VERSION
  description: string;
  /** Applied per record, in the live DB upgrade AND on import. Must be PURE and idempotent. */
  record?: Partial<Record<Exclude<StoreName, 'meta'>, RecordMigrator>>;
  /** Whole-document fixups that cannot be expressed per record (splits, cross-store moves). */
  doc?: (doc: any) => any;
}

export const MIGRATIONS: SchemaMigration[] = [];         // empty at V1

/** Import path: raises an old backup to SCHEMA_VERSION. Pure — no DB access. */
export function migrateExportDoc(raw: unknown): ExportDoc;

/** Live-DB path: called from a Dexie .upgrade() handler inside its transaction. */
export async function applyRecordMigrations(
  tx: Transaction, fromVersion: number, toVersion: number,
): Promise<void>;
```

`applyRecordMigrations` walks `MIGRATIONS` where `from < m.to <= to`, and for each store with a migrator does `tx.table(store).toCollection().modify(rec => Object.assign(rec, migrator(rec)))`.

**Because the same `record` functions run on both paths, a restored backup and an upgraded-in-place database are guaranteed byte-identical.** That equivalence is a unit test, not a hope:

```ts
// src/data/__tests__/migrations.test.ts
it('import(v1 backup) === upgrade(v1 db) for every version', async () => {
  for (const v of knownVersions) {
    const viaImport  = migrateExportDoc(fixtures[v]);
    const viaUpgrade = await upgradeFixtureDb(v);            // fake-indexeddb
    expect(normalize(viaUpgrade)).toEqual(normalize(viaImport.data));
  }
});
```

### 5.3 Worked example — the next migration

Hypothetical V1.1 adds an optional per-activity reminder time. Complete diff:

```ts
// types.ts
export interface Activity extends Entity {
  /* … */
  reminderTime: string | null;      // 'HH:mm' local, null = none
}

// db.ts
export const DB_VERSION = 1;        // unchanged — no new index
export const SCHEMA_VERSION = 2;    // record shape changed

// db.ts — Dexie still needs a version bump to hang the upgrade on:
this.version(2).stores({ /* identical store strings */ })
    .upgrade(tx => applyRecordMigrations(tx, 1, 2));
// (Dexie requires .version(n) > previous to run an upgrade, so DB_VERSION becomes 2 here too;
//  the store strings are simply repeated unchanged. The two constants still diverge whenever a
//  release changes only indexes, or only import-time interpretation.)

// migrations.ts
MIGRATIONS.push({
  to: 2,
  description: 'Activity.reminderTime (nullable) added',
  record: { activities: a => ({ ...a, reminderTime: a.reminderTime ?? null }) },
});
```

An engineer implementing a migration follows exactly three rules:
1. **Never** mutate a record in place outside `.modify()`.
2. Migrators must be **idempotent** — running twice equals running once (interrupted upgrades happen).
3. Every migration ships with a frozen fixture file `src/data/__fixtures__/export-v{n}.json`, committed forever. That fixture is what proves version *n* still imports two years later.

### 5.4 Import compatibility gate (§15)

```ts
// src/data/importer.ts
export type ImportPlan =
  | { ok: true; doc: ExportDoc; migratedFrom: number | null;
      summary: { goals: number; entries: number; tasks: number; firstDate: LocalDate | null;
                 lastDate: LocalDate | null; collisions: number } }
  | { ok: false; errors: ImportError[] };

export function planImport(rawJson: string): ImportPlan;              // pure, touches nothing
export async function applyImport(plan: Extract<ImportPlan,{ok:true}>,
                                  mode: 'replace' | 'merge'): Promise<void>;
```

Rules:

* `doc.format !== 'goal-backward-planner'` → reject, "This file wasn't created by Goal Planner."
* `doc.schemaVersion > SCHEMA_VERSION` → **reject**, "This backup was made by a newer version of the app. Update the app, then import." Never partially read a future format.
* `doc.schemaVersion < SCHEMA_VERSION` → run `migrateExportDoc`, report "Upgraded from format v1 to v2" in the confirm dialog.
* Validation happens **entirely before any write** (§15: "Validate imported JSON before modifying existing data"). `planImport` is pure and returns a summary the confirm screen renders.
* `applyImport` runs in **one `rw` transaction across all stores**; a mid-way failure rolls back completely.
* `'replace'` clears all stores except `meta` and `trash` first (a pending 30-day undo is not part of "your data", so an unrelated import does not wipe it). `'merge'` keeps existing rows and inserts incoming ones, resolving id collisions by **keeping the record with the greater `updatedAt`** (deterministic, no prompts) and counting them in `summary.collisions`.
* Before a `'replace'`, the current database is auto-exported to a `meta`-free in-memory `ExportDoc` and offered as a download — a free safety net on the one destructive operation in the app.

### 5.5 Referential validation (`src/data/validate.ts`)

`validateExportDoc` returns every failure, not just the first — a user with a half-corrupt file deserves the whole list.

| Check | Failure code |
|---|---|
| every `LocalDate` matches `/^\d{4}-(0[1-9]\|1[0-2])-(0[1-9]\|[12]\d\|3[01])$/` | `BAD_DATE` |
| every number is `Number.isFinite` | `BAD_NUMBER` |
| `activity.goalId`, `milestone.goalId`, `task.goalId`, `plan.goalId`, `entry.goalId` all exist in `goals` | `ORPHAN_GOAL_REF` |
| `entry.activityId`, `task.activityId`, `target.activityId` exist in `activities` | `ORPHAN_ACTIVITY_REF` |
| `entry.goalId === activity.goalId` for its activity (denormalisation consistency) | `DENORM_MISMATCH` |
| `entry.kind === activity.kind` | `KIND_MISMATCH` |
| `(goalId, weekStart)` unique across `weeklyPlans` | `DUPLICATE_WEEK_PLAN` |
| ≤ 1 activity with `role: 'outcome'` per goal; exactly 1 for `type: 'metric'` | `OUTCOME_CARDINALITY` |
| `goal.type` is one of the four; `config` matches the type | `BAD_GOAL_CONFIG` |
| unknown `entry.kind` | `UNKNOWN_KIND` → **warning, not error** (forward-compat, §1.6) |
| ids are unique within each collection | `DUPLICATE_ID` |
| `resolveDeadline(deadline) >= startDate` when a deadline is present | `BAD_RANGE` |

### 5.6 Storage sizing (why no pruning in V1)

| Store | Rows/year (3 active goals) | ≈ bytes/row | ≈ bytes/year |
|---|---|---|---|
| `entries` | 3 goals × ~3 entries/day × 365 ≈ 3,300 | 220 | 0.73 MB |
| `tasks` | ~5/day × 365 ≈ 1,800 | 320 | 0.58 MB |
| `weeklyPlans` | 52 × 3 = 156 | 280 | 0.04 MB |
| everything else | < 100 | — | < 0.03 MB |
| **total** | | | **≈ 1.4 MB/year** |

IndexedDB quotas are in the hundreds of MB minimum. **No archiving, pruning or pagination is needed in V1** — that is a decision, and it removes a whole category of code. The export file at the same scale is ~1.5 MB of JSON, which downloads and re-imports instantly.

---

## 6. Identity, timestamps, archive and delete

### 6.1 IDs

UUIDv4 via `newId()` (§3). `crypto.randomUUID` requires a secure context, which a PWA already requires (§18); the `getRandomValues` fallback exists solely for testing over `http://192.168.x.x` on a phone. IDs are **never** derived from content and **never** reused, so merge-import cannot silently overwrite an unrelated record.

Branded types make `deleteGoalCascade(activityId)` a compile error. Cost at runtime: zero — brands erase completely.

### 6.2 Timestamps

Every entity carries `createdAt`/`updatedAt` (epoch ms), stamped by `touch()` in the repo layer. `updatedAt` is used for merge-import conflict resolution (§5.4) and the "recently updated" ordering — not for display; §9's "Recent activity" reads `entries.loggedAt`, which is the meaningful clock for the user.

### 6.3 Pause, archive, delete (§8)

| Action | Effect | Data |
|---|---|---|
| **Pause** | goal stops generating plans and tasks; drops off Today; still visible under "Paused" | `status = 'paused'` |
| **Archive** | goal leaves all active lists; history and charts remain fully readable | `status = 'archived'`, `archivedAt = now` |
| **Complete** | celebratory-but-restrained end state (§17: minimal gamification) | `status = 'completed'`, `completedAt = now` |
| **Delete** | permanent removal of the goal and everything under it | hard cascade + 30-day trash entry |

```ts
const TRASH_RETENTION_MS = 30 * 24 * 3_600_000;

export async function deleteGoalCascade(goalId: GoalId): Promise<TrashEntry> {
  const db = getDb();
  return db.transaction('rw',
    [db.goals, db.activities, db.milestones, db.weeklyPlans, db.tasks, db.entries, db.trash],
    async () => {
      const snapshot: GoalSubtree = {
        goal:        (await db.goals.get(goalId))!,
        activities:  await db.activities.where('goalId').equals(goalId).toArray(),
        milestones:  await db.milestones.where('goalId').equals(goalId).toArray(),
        weeklyPlans: await db.weeklyPlans.where('goalId').equals(goalId).toArray(),
        tasks:       await db.tasks.where('goalId').equals(goalId).toArray(),
        entries:     await db.entries.where('goalId').equals(goalId).toArray(),
      };
      await db.entries.where('goalId').equals(goalId).delete();
      await db.tasks.where('goalId').equals(goalId).delete();
      await db.weeklyPlans.where('goalId').equals(goalId).delete();
      await db.milestones.where('goalId').equals(goalId).delete();
      await db.activities.where('goalId').equals(goalId).delete();
      await db.goals.delete(goalId);
      const trashEntry: TrashEntry = {
        id: newId(), goalName: snapshot.goal.name,
        deletedAt: Date.now(), expiresAt: Date.now() + TRASH_RETENTION_MS,
        payload: snapshot,
      };
      await db.trash.add(trashEntry);
      return trashEntry;
    });
}

/** Restores one trash entry by its OWN id (not the goal's id — see TrashEntry). */
export async function undoGoalDelete(trashId: string): Promise<GoalId | null>;
/** Runs at boot. Deletes every trash row past its expiresAt. */
export async function purgeExpiredTrash(now: number): Promise<number>;
```

Each deleted goal gets its **own** trash row, so deleting goal B does not destroy goal A's undo — a real gap in a single-slot design once a user deletes two goals in the same session. `undoGoalDelete` re-inserts every array from one row's `payload` in one transaction, then removes that row. Trash is visible under More → Recently deleted (§8) as a plain list of `goalName` + `deletedAt`, restorable individually, with `purgeExpiredTrash` sweeping anything past 30 days. This is ~15 lines more than a single `meta` slot and removes a real usability gap, without the permanent per-row cost of soft-delete tombstones on every table (§0's rejected alternative).

**Activity deletion is different:** if an activity has ≥ 1 entry it is **archived, never deleted** (`archived = true`) — destroying a user's weigh-in history because they renamed their routine would be unforgivable. Only a zero-entry activity is hard-deleted. The UI says "Hide this activity — your 47 logged entries are kept."

### 6.4 Concurrency

Single user, but **multiple tabs are real** (desktop PWA + a pinned tab). Dexie's `rw` transactions serialise writes within a tab, and IndexedDB serialises across tabs; `useLiveQuery` re-runs on cross-tab writes because Dexie broadcasts change events over `BroadcastChannel`. No extra locking is required. The one genuine hazard is lazy materialisation racing in two tabs and creating two plans for one week — prevented structurally by the **unique** `&[goalId+weekStart]` index, which makes the second insert throw `ConstraintError`; `materializeWeek` catches it and re-reads.

---

## 7. Worked example — the Fitness goal on disk

`goals`
```json
{ "id": "5f2c…", "type": "metric", "name": "Fitness", "status": "active",
  "startDate": "2026-09-14", "deadline": { "precision": "month", "value": "2027-03" },
  "pauses": [], "sortOrder": 0,
  "color": "teal", "completedAt": null, "archivedAt": null,
  "config": { "direction": "increase", "startValue": 43, "targetValue": 50,
              "unit": "kg", "decimals": 1,
              "paceBand": { "minPerWeek": 0.1, "maxPerWeek": 0.5 } },
  "createdAt": 1789000000000, "updatedAt": 1789000000000 }
```

`activities`
```json
{ "id": "a1…", "goalId": "5f2c…", "name": "Weight", "kind": "metric", "role": "outcome",
  "unit": "kg", "decimals": 1, "sortOrder": 0, "archived": false, "color": null,
  "defaultTarget": { "aggregate": "count", "amount": 3, "band": null, "compare": null },
  "scheduling": { "mode": "none" }, "createdAt": 1789000000000, "updatedAt": 1789000000000 }

{ "id": "a2…", "goalId": "5f2c…", "name": "Workout", "kind": "session", "role": "input",
  "unit": null, "decimals": 0, "sortOrder": 1, "archived": false, "color": null,
  "defaultTarget": { "aggregate": "count", "amount": 3, "band": { "min": 2, "max": 4 },
                     "compare": null },
  "scheduling": { "mode": "daysPerWeek", "daysPerWeek": 3, "preferredDays": [1,3,5],
                  "defaultMinutes": 45, "stepTemplate": [] },
  "createdAt": 1789000000000, "updatedAt": 1789000000000 }
```

`weeklyPlans` (week of Mon 2026-09-14)
```json
{ "id": "w1…", "goalId": "5f2c…", "weekStart": "2026-09-14", "weekStartsOn": 1,
  "source": "generated", "tasksGeneratedAt": 1789000100000,
  "targets": [
    { "activityId": "a2…", "aggregate": "count", "amount": 3, "band": { "min": 2, "max": 4 } },
    { "activityId": "a1…", "aggregate": "count", "amount": 3, "band": null }
  ],
  "outcomeBand": { "min": 43.0, "max": 43.2 },
  "createdAt": 1789000100000, "updatedAt": 1789000100000 }
```

`entries`
```json
{ "id": "e1…", "goalId": "5f2c…", "activityId": "a1…", "kind": "metric",
  "date": "2026-09-19", "loggedAt": 1789050000000, "taskId": null, "source": "manual",
  "value": { "n": 43.5, "entryValue": 43.5, "entryUnit": "kg" },
  "createdAt": 1789050000000, "updatedAt": 1789050000000 }

{ "id": "e2…", "goalId": "5f2c…", "activityId": "a2…", "kind": "session",
  "date": "2026-09-16", "loggedAt": 1788900000000, "taskId": "t7…", "source": "task",
  "value": { "count": 1, "minutes": 50, "intensity": 2 },
  "createdAt": 1788900000000, "updatedAt": 1788900000000 }
```

`tasks`
```json
{ "id": "t9…", "goalId": "5f2c…", "activityId": "a2…", "milestoneId": null,
  "date": "2026-09-19", "title": "Workout", "plannedMinutes": 45, "status": "pending",
  "completedAt": null, "steps": [], "source": "generated", "originalDate": null,
  "entryId": null, "sortOrder": 0, "createdAt": 1789000100000, "updatedAt": 1789000100000 }
```

Rendering §7 and §9 from this is pure arithmetic:

```
Today                                     ← summarizeWeek() per goal
Fitness      2 / 3 workouts this week      ← aggregate(entries[a2, 09-14..09-20], 'count') = 2, target 3
Singing      5 / 7 practice days
Piano        2 / 3 practice sessions

Today's Tasks:                             ← tasks where [date+sortOrder] = 2026-09-19
☐ Workout                                  ← t9, plannedMinutes 45
☐ Singing practice — 30 min
☐ Piano — chords practice

Goal detail (§9)
Fitness   43 kg → 50 kg
Current: 43.5 kg     ← latestEntry(a1).value.n  — DERIVED, never stored on the goal
Progress: 7%         ← clamp01((43.5-43)/(50-43))
This week:  Workout 2 / 3      Weight logs 3 / 3
Suggested weight range this week: 43.0 – 43.2 kg   ← outcomeBand, a range, not a prediction (§4)
```

---

## 8. File layout owned by this dimension

```
src/
  domain/
    types.ts          ← §3 above, verbatim. No imports.
    date.ts           ← §2.2. Pure. No date library.
    trackKinds.ts     ← §3.1 adapter registry.
    progress.ts       ← §3.2 aggregate / summarizeWeek / goalProgress. Pure.
    __tests__/        ← date.test.ts, progress.test.ts (literal fixtures, no IndexedDB)
  data/
    db.ts             ← Dexie class, DB_VERSION, SCHEMA_VERSION, getDb()
    migrations.ts     ← MIGRATIONS, migrateExportDoc, applyRecordMigrations
    validate.ts       ← §5.5, no zod
    exporter.ts       ← buildExportDoc(): ExportDoc
    importer.ts       ← planImport / applyImport
    persistence.ts    ← requestPersistence / storageEstimate
    seed.ts           ← defaultSettings(), sample goal for a fresh install
    repo/
      goals.repo.ts  activities.repo.ts  milestones.repo.ts
      plans.repo.ts  tasks.repo.ts       entries.repo.ts  meta.repo.ts
    __fixtures__/export-v1.json    ← frozen forever; migration regression baseline
    __tests__/        ← migrations.test.ts, importer.test.ts (fake-indexeddb)
```

Dev dependency for tests: `fake-indexeddb` only.

## 9. Colour tokens (the stored contract)

`GoalColor` is a **token**, not a hex value, so the visualization dimension can restyle without a migration. Reference values, for whoever implements the palette:

| token | light | dark |
|---|---|---|
| `slate` | `#64748B` | `#94A3B8` |
| `blue` | `#2563EB` | `#60A5FA` |
| `teal` | `#0D9488` | `#2DD4BF` |
| `green` | `#16A34A` | `#4ADE80` |
| `amber` | `#D97706` | `#FBBF24` |
| `rose` | `#E11D48` | `#FB7185` |
| `violet` | `#7C3AED` | `#A78BFA` |

Seven options, assigned round-robin on goal creation. No colour picker — §17 "avoid complicated forms".

---

## 10. Deviations from §16, stated plainly

§16 is a sketch, and two of its fields are actively harmful if taken literally. Both deviations are listed here so nobody thinks they were overlooked:

1. **`Goal.currentValue` is not stored.** It is `latestEntry(outcomeActivity).value.n`, falling back to `config.startValue`. Storing it guarantees a drift bug the first time an entry is edited or deleted.
2. **`WeeklyPlan.actuals` is not stored.** It is `aggregate(entriesForWeek(...), target.aggregate)`. Storing it makes §13's "planned vs actual" wrong after any backdated log or reschedule.

Everything else in §16 is present, usually with more structure: `Goals`, `Milestones`, `Weekly Plans`, `Daily Tasks`, `Measurements` (as `entries`, generalised over four tracking kinds per §12) and `User Settings`. The additions are `activities` — required by §2/§9 and argued in §1 — and `meta`.
