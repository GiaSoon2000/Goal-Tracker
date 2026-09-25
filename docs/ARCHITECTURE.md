# Goal Backward Planner — Dimension Design: Application Architecture, Stack, PWA & Offline

Author: architecture dimension lead
Date: 2026-09-19
Scope: build tooling, stack, layering, state, routing, app shell, PWA/offline, testing, folder structure.
Out of scope (owned by other dimensions, referenced only where the architecture constrains them): entity field lists (data-model), planning formulas (planning-engine), visual tokens & screen copy (ux), chart rendering (visualization), backup JSON schema (data-io), failure taxonomy (edge-cases).

Project root for every path in this document: `D:\Self Project\Goal Tracker\` (POSIX form `D:/Self Project/Goal Tracker/`). **Note the space in the path** — every script must quote paths and use `node:path` joins, never bare string concatenation in shell.

---

## 0. Decisions

| Decision | Rationale | Rejected alternative |
|---|---|---|
| **Vite 7 + React 19 + React Router 7 SPA** (static `dist/`) | No SSR to remove, no RSC payloads, no `generateStaticParams` problem for runtime-created goal ids, ~1/5 the dev-server cold start on Windows/NTFS, `vite-plugin-pwa` is the most mature static-PWA toolchain. §14 names "React / Next.js" — React is satisfied; Next is offered, not mandated. | Next.js App Router `output: 'export'`. Killer flaw: `/goals/[id]` cannot be statically generated because ids are minted at runtime in IndexedDB (§16); you end up with a catch-all client shell — i.e. reimplementing an SPA inside a framework whose main feature (the server) is disabled. |
| **Zero global state library. Dexie `liveQuery` + `useLiveQuery` is the only read path.** | IndexedDB is already the single source of truth (§14). A second cache means two truths and manual invalidation after every write. `liveQuery` re-runs affected queries automatically and syncs across tabs via BroadcastChannel for free. | React Query (a cache over a local DB you can observe directly), Zustand (needs hand-written invalidation on every mutation), Context+useReducer mirror of the DB (guaranteed drift). |
| **Dexie 4 is the only IndexedDB API** | Declarative schema versions + `upgrade()` give us §16 "support future extensions without a major rewrite"; transactions are one line; `liveQuery` is the state layer. | Raw `indexedDB` (300 lines of boilerplate + hand-rolled migrations), `idb-keyval` (no indexes → no `tasks by date` query). |
| **CSS Modules + CSS custom-property tokens, no CSS framework** | Vite supports `*.module.css` with zero config and zero deps. ~25 components total; a token file plus scoped CSS is smaller to read than utility soup, and §17 asks for a clean minimal system, which is a token problem, not a velocity problem. Ships ~10 kB CSS. | Tailwind (3 deps + PostCSS + content scanning + class-string noise in every JSX line for an app this small), CSS-in-JS (runtime cost, hydration-era baggage). |
| **No date library. `src/domain/date.ts` + `Intl.DateTimeFormat`** | The whole date surface is ~16 functions over `YYYY-MM-DD` civil-date strings. `Intl` does display formatting better than any library, for 0 bytes. Pure string/`Date` functions are trivially unit-testable — which §4/§5 math demands anyway. | `date-fns` (70 kB source, tree-shaken but still a dep for logic we must test ourselves regardless), `dayjs`/`luxon` (worse: mutable-ish API / 60 kB). |
| **System font stack, no webfonts** | Removes the only remaining network asset class → offline is guaranteed by construction, text paints instantly, no FOUT. | Self-hosted Inter woff2 (adds 4 files to precache, +80 kB, and a font-loading state). |
| **`vite-plugin-pwa` `generateSW` (Workbox), `registerType: 'prompt'`** | Precaches the whole build; there are zero runtime network requests, so no runtime-caching rules are needed. `prompt` (not `autoUpdate`) because silently reloading while a user is mid-form loses their input. | Hand-written service worker (precache-manifest maintenance = stale-asset bugs), `autoUpdate` (data loss risk), no SW (fails §18). |
| **Document scroll + `position: fixed` bottom nav on tab routes; full-screen routes render no nav** | Native momentum scrolling, free scroll restoration, no nested-scroll traps. Form routes hide the nav so the iOS keyboard never fights it, which also enforces §17 "one primary action per screen". | Inner `overflow-y:auto` shell (breaks `ScrollRestoration`, causes iOS rubber-band traps), nav visible on forms. |
| **`createBrowserRouter` + `RouterProvider`, **no** loaders/actions** | Gives `<ScrollRestoration/>` and nested layout routes; data still comes from live queries so loaders would just be a second, staler read path. | Declarative `<BrowserRouter>` (no ScrollRestoration), HashRouter (ugly URLs, no benefit once `404.html` exists). |
| **TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`** | Planning math indexes arrays of weeks constantly (§10); unchecked indexing is where off-by-one bugs hide. | Default `strict` only. |
| **Vitest, node environment, domain-first. No component-testing library in V1.** | §4/§5 correctness lives in pure functions; those get ~95% coverage. UI is verified by hand against §7–§13 wireframes. Saves 4 dev deps and an emulated-DOM maintenance surface. | Jest (slower, needs its own transform config), RTL+jsdom in V1, Playwright E2E in V1. |
| **Exact pinned versions, committed `package-lock.json`, `npm ci` for builds** | A local-first app should build identically in two years with no network surprises. | Caret ranges (a minor Dexie bump silently changing `liveQuery` semantics). |
| **Only `src/db/**` and `src/repo/**` may import Dexie. Enforced by ESLint.** | Keeps persistence swappable and keeps `src/domain/**` pure so it can be tested in node with no DB at all. | Convention-only discipline (rots by week 3). |
| **Route-level code splitting for `/progress` only** | The chart library is the only heavy chunk. Splitting five 6 kB screens costs more in waterfalls than it saves. | Split everything; split nothing. |
| **CSP `default-src 'self'` meta tag** | Mechanically enforces §19 "no external data collection" — a stray third-party request cannot happen even by mistake. | No CSP. |

---

## 1. Stack, dependency budget, versions policy

### 1.1 Runtime dependencies — hard cap of 6

| Package | Major | Why it is irreplaceable |
|---|---|---|
| `react` | 19.x | — |
| `react-dom` | 19.x | — |
| `react-router-dom` | 7.x | `/goals/:goalId` (§9), nested tab layout, `ScrollRestoration` |
| `dexie` | 4.x | IndexedDB schema/versioning/transactions (§14, §16) |
| `dexie-react-hooks` | 4.x | `useLiveQuery` — the state layer |
| *chart library* | — | **Slot reserved for the visualization dimension.** Budget: ≤ 60 kB gzipped, no CDN/webfont/runtime fetch, tree-shakeable, works with `default-src 'self'`. If hand-rolled SVG is chosen, this slot stays empty and the cap drops to 5. |

Nothing else. Specifically **not** installed: a date library, a UUID library, a form library, a validation library (`src/domain/io/validate.ts` is hand-written — see §9.3), an icon package (inline SVG in `src/ui/icons.tsx`), a state library, an animation library (§17 "avoid unnecessary animations").

### 1.2 Dev dependencies

```
vite  @vitejs/plugin-react  vite-plugin-pwa
typescript  @types/react  @types/react-dom
vitest  @vitest/coverage-v8  fake-indexeddb
eslint  @eslint/js  typescript-eslint  eslint-plugin-react-hooks  globals
prettier
```

`fake-indexeddb` earns its place: §15 import/export and §16 migrations are exactly the code that must be tested, and they cannot be tested without an IDB implementation in node.

### 1.3 Versions policy

1. Install once with `--save-exact`; `package.json` carries **exact** versions (`"dexie": "4.0.11"`, not `"^4.0.11"`).
2. `package-lock.json` is committed. CI/local builds use `npm ci`.
3. Upgrades are deliberate: `npm outdated`, read the changelog, bump one package per commit, `npm run check` must pass.
4. Majors listed above are the contract. If a peer-dependency conflict appears between React 19 and `dexie-react-hooks`, the documented fallback is React `18.3.1` — nothing in this design uses a React-19-only API.
5. Node `22.16.0` (per spec environment facts); `package.json` declares `"engines": { "node": ">=20.19" }` (Vite 7 floor).

### 1.4 Bootstrap (deterministic, no interactive prompts)

Scaffolding via `npm create vite` is **not** used: it prompts when the directory is non-empty (`docs/` already exists). Create files from this document instead.

```powershell
cd "D:\Self Project\Goal Tracker"
git init
npm init -y
npm i --save-exact react react-dom react-router-dom dexie dexie-react-hooks
npm i -D --save-exact vite @vitejs/plugin-react vite-plugin-pwa typescript @types/react @types/react-dom `
                       vitest @vitest/coverage-v8 fake-indexeddb `
                       eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals prettier
```

Then write `index.html`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc.json`, `.gitignore`, `scripts/postbuild.mjs` and `src/**` exactly as specified below.

---

## 2. Layering and dependency direction

```
                 ┌──────────────────────────────────────────┐
   imports  →    │  src/screens/**      route screens        │
                 │  src/app/**          shell, nav, providers│
                 └───────────┬──────────────────┬────────────┘
                             │                  │
                 ┌───────────▼──────┐   ┌───────▼───────────┐
                 │  src/ui/**       │   │  src/hooks/**     │
                 │  dumb components │   │  live queries +   │
                 │  (props in,      │   │  command wrappers │
                 │   events out)    │   └───────┬───────────┘
                 └──────────────────┘           │
                                   ┌────────────▼────────────┐
                                   │  src/repo/**            │
                                   │  the ONLY callers of db │
                                   └────────────┬────────────┘
                                                │
                                   ┌────────────▼────────────┐
                                   │  src/db/**   Dexie       │
                                   └─────────────────────────┘

   ┌───────────────────────────────────────────────────────────┐
   │  src/domain/**   pure TypeScript. No React. No Dexie.      │
   │  Imported by screens, hooks, repo, and tests alike.        │
   └───────────────────────────────────────────────────────────┘
```

Rules, all ESLint-enforced (§10.3):

| Layer | May import | May NOT import |
|---|---|---|
| `src/domain/**` | other `domain` modules only | `react`, `react-dom`, `dexie`, `../repo`, `../db`, `../ui`, anything with a side effect |
| `src/db/**` | `dexie`, `src/domain/types` | `react`, `src/repo`, `src/ui`, `src/screens`, `src/hooks` |
| `src/repo/**` | `src/db`, `src/domain/**` | `react`, `src/ui`, `src/screens`, `src/hooks` |
| `src/hooks/**` | `react`, `dexie-react-hooks`, `src/repo`, `src/domain/**` | `dexie` (direct), `src/db`, `src/screens` |
| `src/ui/**` | `react`, `src/domain/**` (types & formatters only) | `src/repo`, `src/db`, `src/hooks`, `src/screens` |
| `src/screens/**` | everything above except `src/db` and `dexie` | `dexie`, `src/db` |
| `src/app/**` | same as screens | `dexie`, `src/db` (exception: `src/app/providers/DbProvider` is not needed — see §4.4) |

**Which layer touches IndexedDB:** `src/db/database.ts` constructs the single `Dexie` instance. `src/repo/**` is the only importer of it. No component, hook, screen, or domain function ever calls `db.*` directly. Every write is a `repo` function; every write that touches more than one table is wrapped in `db.transaction('rw', ...)`.

**Why this direction matters here:** §5 re-planning rewrites many `weeklyPlans` rows at once. If a screen could write directly, a partially-applied re-plan would be observable. Forcing every mutation through a repo transaction makes "the plan is always internally consistent" a structural property, not a code-review hope.

---

## 3. Routing table and app shell

### 3.1 Routes

`src/routes.tsx` (object router, no loaders):

| Path | Element | Nav visible | Spec |
|---|---|---|---|
| `/` | redirect → `/today` | — | §7 default home |
| `/today` | `TodayScreen` | yes | §7 |
| `/goals` | `GoalsScreen` | yes | §8 |
| `/goals/new` | `GoalFormScreen mode="create"` | **no** | §8 create |
| `/goals/:goalId` | `GoalDetailScreen` | **no** (back header) | §9 |
| `/goals/:goalId/edit` | `GoalFormScreen mode="edit"` | **no** | §8 edit |
| `/goals/:goalId/plan-review` | `PlanReviewScreen` | **no** | §4 "the user must be able to edit the generated plan" |
| `/plan` | `PlanScreen` | yes | §10 |
| `/plan/:weekStart` | `WeekDetailScreen` (`weekStart` = `YYYY-MM-DD` Monday) | **no** | §10 "open a week and edit its targets" |
| `/progress` | `ProgressScreen` (lazy) | yes | §13 |
| `/more` | `MoreScreen` | yes | §6 |
| `/more/backup` | `BackupScreen` | **no** | §15 |
| `/more/settings` | `SettingsScreen` | **no** | §16 User Settings |
| `/more/about` | `AboutScreen` | **no** | — |
| `*` | `NotFoundScreen` (link back to `/today`) | **no** | — |

Five tabs exactly, per §6: Today, Goals, Plan, Progress, More. No drawer, no nested tabs, no modal router.

```tsx
// src/routes.tsx
import { lazy, Suspense } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import { TabLayout } from './app/TabLayout';
import { FullLayout } from './app/FullLayout';
import { ScreenFallback } from './ui/ScreenFallback';
import { TodayScreen } from './screens/today/TodayScreen';
import { GoalsScreen } from './screens/goals/GoalsScreen';
import { GoalDetailScreen } from './screens/goals/GoalDetailScreen';
import { GoalFormScreen } from './screens/goals/GoalFormScreen';
import { PlanReviewScreen } from './screens/goals/PlanReviewScreen';
import { PlanScreen } from './screens/plan/PlanScreen';
import { WeekDetailScreen } from './screens/plan/WeekDetailScreen';
import { MoreScreen } from './screens/more/MoreScreen';
import { BackupScreen } from './screens/more/BackupScreen';
import { SettingsScreen } from './screens/more/SettingsScreen';
import { AboutScreen } from './screens/more/AboutScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';

const ProgressScreen = lazy(() =>
  import('./screens/progress/ProgressScreen').then((m) => ({ default: m.ProgressScreen })),
);

export const routes: RouteObject[] = [
  {
    element: <TabLayout />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: <TodayScreen /> },
      { path: 'goals', element: <GoalsScreen /> },
      { path: 'plan', element: <PlanScreen /> },
      {
        path: 'progress',
        element: (
          <Suspense fallback={<ScreenFallback />}>
            <ProgressScreen />
          </Suspense>
        ),
      },
      { path: 'more', element: <MoreScreen /> },
    ],
  },
  {
    element: <FullLayout />,
    children: [
      { path: 'goals/new', element: <GoalFormScreen mode="create" /> },
      { path: 'goals/:goalId', element: <GoalDetailScreen /> },
      { path: 'goals/:goalId/edit', element: <GoalFormScreen mode="edit" /> },
      { path: 'goals/:goalId/plan-review', element: <PlanReviewScreen /> },
      { path: 'plan/:weekStart', element: <WeekDetailScreen /> },
      { path: 'more/backup', element: <BackupScreen /> },
      { path: 'more/settings', element: <SettingsScreen /> },
      { path: 'more/about', element: <AboutScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];
```

```tsx
// src/App.tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './routes';

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });

export function App() {
  return <RouterProvider router={router} />;
}
```

### 3.2 Shell wireframe

```
 ┌──────────────────────────────────────┐  ← env(safe-area-inset-top)
 │  Today                       Thu 19  │  <header class="screenHeader">  sticky, top:0
 ├──────────────────────────────────────┤
 │                                      │
 │  Fitness        2 / 3 workouts       │
 │  Singing        5 / 7 practice days  │  document scroll
 │  Piano          2 / 3 sessions       │  .content { max-width:560px; margin-inline:auto }
 │                                      │
 │  Today's Tasks                       │
 │  ☐ Workout                           │
 │  ☐ Singing practice — 30 min         │
 │  ☐ Piano — chords practice           │
 │                                      │
 │        (padding-bottom = nav + inset)│
 ├──────────────────────────────────────┤
 │  ◷      ◎      ▤      ◻      ⋯       │  <nav> position:fixed; bottom:0
 │ Today  Goals  Plan  Progress  More   │  height 56px + safe-area-inset-bottom
 └──────────────────────────────────────┘  ← env(safe-area-inset-bottom)

 Full-screen route (no nav):
 ┌──────────────────────────────────────┐
 │  ‹ Back        Edit goal      Save   │  <header> — one primary action (§17)
 ├──────────────────────────────────────┤
 │  …form…                              │
 └──────────────────────────────────────┘
```

```tsx
// src/app/TabLayout.tsx
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
```

```css
/* src/app/TabLayout.module.css */
.page {
  max-width: 560px;
  margin-inline: auto;
  padding-inline: max(16px, env(safe-area-inset-left), env(safe-area-inset-right));
  padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--space-6));
}
```

```css
/* src/app/BottomNav.module.css */
.nav {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  height: calc(var(--nav-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--surface);
  border-top: 1px solid var(--border);
}
.item {
  display: grid;
  place-items: center;
  gap: 2px;
  min-height: 48px;           /* §17 large touch targets */
  font-size: 11px;
  color: var(--fg-muted);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.item[aria-current='page'] { color: var(--accent); }

@media (min-width: 700px) {
  .nav {
    inset-inline: auto;
    left: 50%;
    transform: translateX(-50%);
    bottom: 16px;
    width: 520px;
    border: 1px solid var(--border);
    border-radius: 16px;
  }
}
```

Constants owned here (UX dimension may restyle colors but not these geometry rules):
`--nav-h: 56px`, minimum touch target `48px`, content column `max-width: 560px`, base page gutter `16px`.

---

## 4. State management

### 4.1 The rule

> **Persistent state lives in IndexedDB and is read only through `useLiveQuery`. Ephemeral state lives in `useState`/`useReducer` in the nearest component. There is no third place.**

Three Contexts exist, and only three, each holding non-persistent cross-cutting concerns:

| Provider | File | Holds |
|---|---|---|
| `ToastProvider` | `src/app/providers/ToastProvider.tsx` | transient messages ("Plan updated", "Backup saved") + `undo` callback slot |
| `ConfirmProvider` | `src/app/providers/ConfirmProvider.tsx` | promise-returning `confirm(opts)` for destructive actions (§8 delete, §15 import replace) |
| `UpdateProvider` | `src/app/providers/UpdateProvider.tsx` | service-worker update state (§6.5) |

Settings (§16) are **not** a Context — they are a Dexie row read with `useSettings()`, so a settings change re-renders exactly the subscribers.

### 4.2 The live-query wrapper

`useLiveQuery` returns `undefined` while the first query is in flight, which collides with "not found". Contract: **every repo finder returns `T | null`, never `undefined`.** That makes `undefined` unambiguously mean "loading".

```ts
// src/hooks/useLive.ts
import { useLiveQuery } from 'dexie-react-hooks';

export type Live<T> = { data: T; loading: boolean };

/**
 * Subscribe to a Dexie query. `initial` is returned while loading so screens
 * can render their real layout (with skeletons) instead of branching.
 * INVARIANT: `querier` must never resolve to `undefined` (repos return `null`).
 */
export function useLive<T>(querier: () => Promise<T>, deps: unknown[], initial: T): Live<T> {
  const data = useLiveQuery(querier, deps);
  return data === undefined ? { data: initial, loading: true } : { data, loading: false };
}
```

Query-authoring rules:
1. A querier performs **reads and cheap shaping only** (map/filter/sum). Planning math (§4/§5) never runs inside a querier — it runs in an event handler or a `useMemo` over the query result, so it is not re-executed on every unrelated table write.
2. Queriers must be deterministic given `deps`. Never read `new Date()` inside one; take `today: LocalDate` as a dep (see `useToday()`, §8.2).
3. One querier per screen concern; compose repos inside it rather than firing five hooks.

Example hooks:

```ts
// src/hooks/useTasks.ts
import { taskRepo } from '../repo';
import type { DailyTask, LocalDate } from '../domain/types';
import { useLive, type Live } from './useLive';

const NO_TASKS: DailyTask[] = [];

export function useTasksForDate(date: LocalDate): Live<DailyTask[]> {
  return useLive(() => taskRepo.listByDate(date), [date], NO_TASKS);
}
```

`NO_TASKS` is a module-level constant so the "loading" identity is stable and does not retrigger `useMemo`/`useEffect` downstream.

### 4.3 The command path (writes)

Writes are plain `async` calls to repos from event handlers. No mutation hook abstraction, no optimistic updates — a local IndexedDB write completes in single-digit milliseconds and `liveQuery` repaints automatically, so optimism buys nothing and costs rollback logic.

```ts
// src/hooks/useCommands.ts  — thin, only where a write needs a toast/undo
export function useToggleTask() {
  const toast = useToast();
  return useCallback(
    async (task: DailyTask) => {
      const next = task.status === 'done' ? 'planned' : 'done';
      await taskRepo.setStatus(task.id, next);
      if (next === 'done') toast.show('Done', { undo: () => taskRepo.setStatus(task.id, task.status) });
    },
    [toast],
  );
}
```

### 4.4 Free properties we get from this choice

- **Cross-tab consistency.** Dexie broadcasts writes over `BroadcastChannel`; two open tabs (or a tab plus the installed PWA on Android) stay in sync with no code.
- **No invalidation bugs.** There is no cache key to forget.
- **Testability.** Domain math is tested without React; repos are tested against `fake-indexeddb`; no store mocks exist.

There is no `DbProvider` — the Dexie instance is a module singleton (`src/db/database.ts`). Injecting it via Context would only help if we planned to swap the DB at runtime, which we do not; tests import the same singleton with `fake-indexeddb/auto` loaded in `src/test/setup.ts`.

---

## 5. Persistence plumbing (architecture's share; data-model owns the fields)

*DATA-MODEL.md §4 owns the authoritative schema (stores, exact index list with the query each one serves, and the `activities`/`trash` stores this section's first draft predates). The shape below is this dimension's illustration of where the Dexie instance and version-bump mechanism live — for the real store/index list, see DATA-MODEL.md §4.2–§4.3.*

```ts
// src/db/database.ts
import Dexie, { type EntityTable } from 'dexie';
import type { Goal, Activity, Milestone, WeeklyPlan, DailyTask, TrackEntry, Settings, MetaRecord, TrashEntry } from '../domain/types';
import { applySchema } from './schema';

export class GoalPlannerDb extends Dexie {
  goals!: EntityTable<Goal, 'id'>;
  activities!: EntityTable<Activity, 'id'>;
  milestones!: EntityTable<Milestone, 'id'>;
  weeklyPlans!: EntityTable<WeeklyPlan, 'id'>;
  tasks!: EntityTable<DailyTask, 'id'>;
  entries!: EntityTable<TrackEntry, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;
  trash!: EntityTable<TrashEntry, 'id'>;

  constructor() {
    super('goal-planner');
    applySchema(this);
  }
}

export const db = new GoalPlannerDb();
```

```ts
// src/db/schema.ts — mechanism only; DATA-MODEL.md §4.2 has the real `.stores()` call
import type { GoalPlannerDb } from './database';
import { DEFAULT_SETTINGS } from '../domain/defaults';

/** Bump by adding a new `version(n)` block. NEVER edit an existing one. */
export const DB_SCHEMA_VERSION = 1;

export function applySchema(db: GoalPlannerDb): void {
  db.version(1).stores({ /* DATA-MODEL.md §4.2 — goals, activities, milestones, weeklyPlans, tasks, entries, settings, meta, trash */ });

  db.on('populate', async () => {
    await db.settings.add(DEFAULT_SETTINGS);
  });
}
```

Rules:
- The index list above is a starting point; the **data-model dimension owns the final fields**, but this rule is architectural: *every property a repo filters or sorts on must be a declared index*. Adding one is a new `db.version(n)` block with an `upgrade()` if data must be backfilled.
- `settings` is a single row with `id: 'singleton'`.
- Multi-tab schema upgrade handling lives in `src/db/lifecycle.ts`:

```ts
// src/db/lifecycle.ts
import { db } from './database';

export function installDbLifecycle(onNeedsReload: (reason: 'versionchange' | 'blocked') => void): void {
  db.on('versionchange', () => {
    db.close();                       // let the other tab's upgrade proceed
    onNeedsReload('versionchange');
  });
  db.on('blocked', () => onNeedsReload('blocked'));
}
```

Storage durability (§18 "persist data locally"):

```ts
// src/db/persistence.ts
export type PersistState = 'persisted' | 'denied' | 'unsupported';

export async function ensurePersistence(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported';   // Safari/WebKit today
  if (await navigator.storage.persisted()) return 'persisted';
  return (await navigator.storage.persist()) ? 'persisted' : 'denied';
}

export async function storageEstimate(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usageBytes: e.usage ?? 0, quotaBytes: e.quota ?? 0 };
}
```

`ensurePersistence()` is called **after the user's first successful goal creation**, not at startup — Chrome may show a permission-ish prompt and it is pointless before there is data to protect. The result is displayed on `/more/backup` together with the last-export date, which is the honest way to tell a local-first user how safe their data is (§15 "critical feature, because data is stored locally").

---

## 6. PWA, offline, install, update

### 6.1 `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
    />
    <title>Goal Planner</title>
    <meta name="description" content="Plan backward from a goal to this week and today." />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FFFFFF" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121316" />
    <meta name="color-scheme" content="light dark" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Goal Planner" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`style-src 'unsafe-inline'` is required because React sets inline `style` attributes (progress-bar widths, chart geometry). Script is **not** allowed inline — `script-src 'self'` stands, which is where the actual risk would be.

`apple-mobile-web-app-status-bar-style: default` (not `black-translucent`) means iOS keeps an opaque status bar, so `env(safe-area-inset-top)` is 0 in portrait standalone and we do not have to paint under the clock. Left/right insets still matter in landscape on notched devices, hence `padding-inline: max(16px, env(safe-area-inset-left), …)`.

### 6.2 Manifest (generated by `vite-plugin-pwa`)

```ts
manifest: {
  id: '/',
  name: 'Goal Planner — backward planning',
  short_name: 'Goal Planner',
  description: 'Turn a goal and a deadline into milestones, weekly targets and today\u2019s tasks.',
  start_url: '/?source=pwa',
  scope: '/',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui'],
  orientation: 'portrait',
  background_color: '#FFFFFF',
  theme_color: '#FFFFFF',
  lang: 'en',
  dir: 'ltr',
  categories: ['productivity', 'lifestyle'],
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [
    { name: "Today", url: '/today', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    { name: 'Add goal', url: '/goals/new' },
  ],
}
```

`start_url: '/?source=pwa'` — the query string is never read by the app; it exists only so the user can distinguish installed launches from browser launches in devtools without adding analytics (§19).

Icon assets required in `public/icons/`: `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (with ≥ 20% safe padding on all sides), `apple-touch-icon-180.png` (opaque background — iOS does not respect transparency), plus `public/favicon.svg`.

### 6.3 `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,              // we register manually in src/pwa/register.ts
      strategies: 'generateSW',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: { /* §6.2 */ },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/404\.html$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,              // the user decides — see §6.5
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [],              // the app makes ZERO network requests
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,                     // local-only; helps debug on the real phone
    rollupOptions: { output: { manualChunks: undefined } },
  },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/repo/**', 'src/db/**'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
```

(Vitest config is merged into `vite.config.ts` — one fewer file. Requires the `/// <reference types="vitest/config" />` triple-slash at the top.)

### 6.4 How "works offline" is guaranteed

1. **There are no network requests after load.** No fonts, no CDN, no API, no analytics (§19). The CSP `connect-src 'self'` makes an accidental `fetch()` to anything external fail loudly in development.
2. **Everything in `dist/` is precached** by the generated service worker on first visit. `globPatterns` covers every emitted asset; Workbox revisions each by content hash.
3. **Navigations resolve offline** via `navigateFallback: 'index.html'`, so a deep link like `/goals/abc` works with the network off once the SW is installed.
4. **Data never needs the network** — Dexie/IndexedDB is local (§14).
5. **Verification is a release checklist item** (§11.4), not an assumption.

### 6.5 Update flow

`registerType: 'prompt'` + `skipWaiting: false`. A new build never activates under a running session, because a schema upgrade or a re-plan mid-edit must not happen behind the user's back.

```ts
// src/pwa/register.ts
import { registerSW } from 'virtual:pwa-register';

export type UpdateApi = { needRefresh: boolean; offlineReady: boolean; update: () => void };

export function createUpdater(onChange: (s: { needRefresh: boolean; offlineReady: boolean }) => void) {
  let needRefresh = false;
  let offlineReady = false;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { needRefresh = true; onChange({ needRefresh, offlineReady }); },
    onOfflineReady() { offlineReady = true; onChange({ needRefresh, offlineReady }); },
    onRegisteredSW(_url, reg) {
      // Check hourly while the app is open; harmless offline (fetch just fails).
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });

  return { update: () => void updateSW(true) };
}
```

UI contract: `src/app/UpdateBanner.tsx` renders a single non-modal bar above the bottom nav — `"A new version is ready.  [Reload]"` — dismissible, reappearing on next launch. `onOfflineReady` shows a one-time toast `"Ready to use offline."` §17's "avoid excessive text" means these are the only two update strings.

`updateSW(true)` posts `SKIP_WAITING` and reloads once the new worker controls the page. React state is lost by design; any in-progress form should already be persisted as a draft by the form screen if it matters (a UX-dimension call).

### 6.6 iOS Safari caveats (explicit, because they change the design)

| Caveat | Consequence for this app |
|---|---|
| No `beforeinstallprompt` | No install button on iOS. `/more` renders platform-detected instructions instead: *"Tap Share, then Add to Home Screen."* Android/desktop Chromium captures `beforeinstallprompt` in `src/pwa/installPrompt.ts` and shows a real button. Detection: `/iphone\|ipad\|ipod/i.test(navigator.userAgent) \|\| (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform))` (iPadOS reports as Mac). |
| Standalone mode has **no browser back button** | Every full-screen route must render its own `‹ Back` affordance — enforced by `FullLayout` always rendering a back header. Detect standalone with `window.matchMedia('(display-mode: standalone)').matches \|\| (navigator as any).standalone === true`. |
| `navigator.storage.persist()` unsupported in WebKit | `ensurePersistence()` returns `'unsupported'`; `/more/backup` then says *"iOS may clear app data if you don't open the app for a long time. Export a backup now and then."* — factual, no alarm (tone rule). |
| WebKit evicts site data after ~7 days of no use for **non-installed** sites; installed home-screen apps are exempt in practice but not contractually | The Backup screen shows `Last export: <date>` and nudges (never nags) when it exceeds 30 days. This is the single strongest argument for §15 being a V1 must-have. |
| `100vh` includes the collapsible toolbar | Never use `100vh`; the shell uses `100dvh` on `body` and document scroll (§3.2). |
| No Web Push / no Notification in older iOS; notifications are V2 anyway | Not designed in (§20). |
| `crypto.randomUUID` requires a **secure context** | Fine on HTTPS and `localhost`; a LAN-IP dev session over plain HTTP falls back (§8.3). |
| Home-screen apps do not share cookies/storage with Safari | Data created in Safari does **not** appear in the installed app. `/more/backup` states this once; the import flow (§15) is the migration path. This is a real first-run trap and must be in the edge-cases catalogue. |

---

## 7. Styling system (mechanism; UX owns the values)

Three global stylesheets, imported once in `src/main.tsx` in this order:

```
src/styles/reset.css    ~40 lines: box-sizing, margin zero, button/input font inheritance,
                        `-webkit-tap-highlight-color: transparent`, `text-size-adjust: 100%`,
                        `@media (prefers-reduced-motion: reduce) { *{animation:none!important} }`
src/styles/tokens.css   all design tokens as custom properties (UX dimension fills the values)
src/styles/global.css   body/typography defaults, `.srOnly`, focus-visible ring
```

Token contract (names are architectural; hex values are placeholders for the UX dimension):

```css
/* src/styles/tokens.css */
:root {
  color-scheme: light dark;

  --bg: #FFFFFF;
  --surface: #FFFFFF;
  --surface-2: #F4F5F7;
  --border: #E3E5E9;
  --fg: #16181D;
  --fg-muted: #656B76;
  --accent: #2F6BFF;
  --accent-fg: #FFFFFF;
  --ok: #1E8E5A;
  --warn: #B26A00;
  --danger: #C0392B;

  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 24px; --space-6: 32px;
  --radius: 12px;
  --nav-h: 56px;
  --tap: 48px;

  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #121316; --surface: #191B1F; --surface-2: #212429; --border: #2C3037;
    --fg: #ECEEF2; --fg-muted: #9AA1AC; --accent: #7EA2FF; --accent-fg: #0F1116;
    --ok: #4CC38A; --warn: #E0A33E; --danger: #F08076;
  }
}
:root[data-theme='dark'] { /* same dark block, so the in-app override wins */ }
```

Theme selection: `settings.theme: 'system' | 'light' | 'dark'` (§16 User Settings) is applied by one effect in `src/app/ThemeEffect.tsx` that sets `document.documentElement.dataset.theme`. System = attribute removed.

Component styles are colocated CSS Modules: `src/ui/Button.tsx` + `src/ui/Button.module.css`. Rule: **a component file may only import its own module stylesheet**; shared values go through tokens, never through cross-imported class names.

---

## 8. Pure-domain modules owned by this dimension

### 8.1 `src/domain/date.ts` — the whole date surface

*DATA-MODEL.md §2 is the authoritative, merged version of this module (it also absorbs EDGE-CASES.md's DST/leap-year test cases and format helpers). The signatures below are illustrative of the surface this dimension expects to exist; treat DATA-MODEL.md as the source of truth for the exact exported function list.*

All dates are **local civil dates** as `'YYYY-MM-DD'` strings. No timestamps, no UTC, no timezone conversions; a user's "Tuesday" is their device's Tuesday. Lexicographic string comparison equals chronological comparison, so `<`/`>`/`===` work directly on `LocalDate` and there are no `isBefore`/`isAfter` helpers.

```ts
export type LocalDate = string;       // 'YYYY-MM-DD', local civil date
export type WeekKey = LocalDate; // always a Monday
export type MonthKey = string;      // 'YYYY-MM'

export function toLocalDate(d: Date): LocalDate;
export function fromLocalDate(s: LocalDate): Date;      // local midnight; never Date.parse
export function isLocalDate(v: unknown): v is LocalDate;
export function today(now?: Date): LocalDate;

export function addDays(date: LocalDate, n: number): LocalDate;
export function diffDays(from: LocalDate, to: LocalDate): number;   // signed, whole days
export function dayOfWeek(date: LocalDate): 0|1|2|3|4|5|6;        // 0 = Monday

export function startOfWeek(date: LocalDate): WeekKey;
export function addWeeks(w: WeekKey, n: number): WeekKey;
export function weeksBetween(a: WeekKey, b: WeekKey): number;
export function eachWeekStart(from: LocalDate, to: LocalDate): WeekKey[];
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[];
export function weekDays(w: WeekKey): [LocalDate,LocalDate,LocalDate,LocalDate,LocalDate,LocalDate,LocalDate];

export function startOfMonth(date: LocalDate): LocalDate;
export function endOfMonth(date: LocalDate): LocalDate;
export function addMonths(date: LocalDate, n: number): LocalDate;   // clamps: Jan 31 +1m = Feb 28/29
export function monthKey(date: LocalDate): MonthKey;
export function monthsBetween(a: LocalDate, b: LocalDate): number;

export function clampDate(d: LocalDate, min: LocalDate, max: LocalDate): LocalDate;
export function daysRemaining(from: LocalDate, deadline: LocalDate): number;

export function formatDay(d: LocalDate): string;        // Intl: "Thu, 19 Sep"
export function formatFullDate(d: LocalDate): string;   // Intl: "19 September 2026"
export function formatMonthYear(d: LocalDate): string;  // Intl: "September 2026"
export function formatWeekRange(w: WeekKey): string; // "14 – 20 Sep"
export function formatRelativeDay(d: LocalDate, base: LocalDate): string; // "Today"|"Tomorrow"|"Yesterday"|formatDay(d)
export function msUntilNextMidnight(now: Date): number;
```

Reference implementations of the three functions everything else depends on:

```ts
const DAY_MS = 86_400_000;

export function toLocalDate(d: Date): LocalDate {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromLocalDate(s: LocalDate): Date {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return new Date(y, m - 1, d);            // local midnight. Date.parse('2026-09-19') is UTC — never use it.
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const d = fromLocalDate(date);
  d.setDate(d.getDate() + n);              // calendar arithmetic → DST-safe
  return toLocalDate(d);
}

export function diffDays(from: LocalDate, to: LocalDate): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / DAY_MS);     // UTC ⇒ immune to DST offset changes
}

export function startOfWeek(date: LocalDate): WeekKey {
  return addDays(date, -dayOfWeek(date));  // dayOfWeek: (Date#getDay() + 6) % 7, Monday = 0
}

export function addMonths(date: LocalDate, n: number): LocalDate {
  const d = fromLocalDate(date);
  const target = d.getMonth() + n;
  const year = d.getFullYear() + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();   // day 0 of next month = last of this
  return toLocalDate(new Date(year, month, Math.min(d.getDate(), lastDay)));
}
```

**Week starts Monday, fixed, in V1.** `Settings` may carry `weekStartsOn` for the future, but V1 hardcodes `1` — a configurable week start multiplies the planning-engine test matrix for no V1 user value (§20 "prioritize usability over feature quantity").

### 8.2 `src/hooks/useToday.ts` — the app must survive midnight

The Today screen (§7) is left open overnight on a phone. A `const today = today()` captured at mount silently shows yesterday's tasks.

```ts
import { useEffect, useState } from 'react';
import { today as computeToday, msUntilNextMidnight, type LocalDate } from '../domain/date';

export function useToday(): LocalDate {
  const [date, setDate] = useState<LocalDate>(() => computeToday());

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setDate(computeToday());
        schedule();
      }, msUntilNextMidnight(new Date()) + 1_000);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setDate(computeToday());          // phone was asleep; timers are unreliable
        window.clearTimeout(timer);
        schedule();
      }
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  return date;
}
```

`useToday()` is the **only** legitimate source of "now" in the UI layer. Domain functions always take dates as parameters — that is what makes §4/§5 testable.

### 8.3 `src/domain/ids.ts`

```ts
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
```

Ids are opaque UUIDv4 and carry no ordering. **Ordering always uses an explicit field** (`createdAt`, `date`, `weekStart`) — a rule the data-model dimension must honour.

### 8.4 `src/app/ErrorBoundary.tsx` — never trap the user's data

A crash in a local-first app with no server copy is the worst failure mode. The boundary renders: the error message, a **"Download backup (JSON)"** button wired straight to `backupRepo.exportSnapshot()` (repo layer, no React state needed), and a "Reload" button. Class component, ~60 lines, wraps `<RouterProvider>`.

---

## 9. Backup path — architectural guarantees (data-io owns the JSON shape)

```ts
// src/repo/backupRepo.ts
import { db } from '../db/database';
import type { BackupSnapshot } from '../domain/io/types';

/** Consistent point-in-time read: one readonly transaction across every table. */
export async function exportSnapshot(): Promise<BackupSnapshot>;

/** All-or-nothing. A failed import leaves the database byte-identical. */
export async function importSnapshot(
  snapshot: BackupSnapshot,
  mode: 'replace' | 'merge',
): Promise<{ inserted: number; updated: number; skipped: number }>;
```

Guarantees this dimension imposes:

1. `exportSnapshot()` runs inside `db.transaction('r', db.goals, db.milestones, db.activities, db.weeklyPlans, db.tasks, db.entries, db.settings, ...)` so a snapshot can never contain a task whose goal is missing.
2. `importSnapshot()` runs inside a single `'rw'` transaction. Validation (`src/domain/io/validate.ts`, pure, no DB) runs to completion **before** the transaction opens (§15 "Validate imported JSON before modifying existing data"). Any throw inside the transaction rolls the whole thing back.
3. The `'replace'` path **auto-exports the current data to a file first** and only then clears — a single confirm dialog cannot be trusted with a user's only copy.
4. File I/O uses `Blob` + `URL.createObjectURL` + `<a download>` for export and `<input type="file" accept="application/json">` for import. The File System Access API is not used: unsupported in Safari/iOS, which is a primary target.
5. Filename: `goal-planner-backup-${today()}.json` (§15).

---

## 10. TypeScript, lint, format

### 10.1 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["vite/client", "vite-plugin-pwa/react", "vitest/globals"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,

    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false
  },
  "include": ["src", "vite.config.ts", "scripts"]
}
```

`noUncheckedIndexedAccess` is non-negotiable: `weeks[i]` in the planning engine is `WeeklyPlan | undefined`, which forces the off-by-one to be handled at compile time rather than becoming a blank week in the Plan screen (§10).

`erasableSyntaxOnly` bans TS enums and parameter properties; the data model uses string-literal unions instead, which also serialise cleanly to the backup JSON (§15).

### 10.2 Path aliases

**None.** Relative imports only. Reason: aliases must be configured in three places (tsconfig, vite, vitest) and the tree is four levels deep at most. Fewer moving parts beats `@/`.

### 10.3 `eslint.config.js` — the layering firewall

```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const deny = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default ts.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-restricted-globals': ['error', { name: 'Date', message: 'Pass dates in; use domain/date.ts.' }],
    },
  },

  // --- layering ---
  {
    files: ['src/domain/**/*.ts'],
    rules: deny([
      { group: ['react', 'react-dom', 'react-router*', 'dexie*'], message: 'domain/ must stay pure.' },
      { group: ['**/repo/**', '**/db/**', '**/ui/**', '**/screens/**', '**/hooks/**'], message: 'domain/ may not depend on outer layers.' },
    ]),
  },
  {
    files: ['src/db/**/*.ts'],
    rules: deny([{ group: ['react*', '**/repo/**', '**/ui/**', '**/screens/**', '**/hooks/**'], message: 'db/ is the innermost persistence layer.' }]),
  },
  {
    files: ['src/repo/**/*.ts'],
    rules: deny([{ group: ['react*', '**/ui/**', '**/screens/**', '**/hooks/**'], message: 'repo/ must not know about the UI.' }]),
  },
  {
    files: ['src/ui/**/*.tsx', 'src/ui/**/*.ts'],
    rules: deny([{ group: ['dexie*', '**/db/**', '**/repo/**', '**/hooks/**', '**/screens/**'], message: 'ui/ components are presentational: props in, events out.' }]),
  },
  {
    files: ['src/screens/**/*.tsx', 'src/app/**/*.tsx', 'src/hooks/**/*.ts'],
    rules: deny([{ group: ['dexie', 'dexie/*', '**/db/**'], message: 'Only repo/ may touch IndexedDB.' }]),
  },
  { files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
);
```

The `no-restricted-globals: Date` rule is deliberately blunt: it forces every date read through `domain/date.ts` or an injected parameter, which is what makes the planning engine deterministic under test. `src/domain/date.ts`, `src/hooks/useToday.ts` and test files carry a file-level `/* eslint-disable no-restricted-globals */`.

### 10.4 `.prettierrc.json`

```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all", "endOfLine": "lf" }
```

`endOfLine: "lf"` plus a `.gitattributes` with `* text=auto eol=lf` — on Windows this prevents CRLF churn that would otherwise make every file look modified.

### 10.5 `package.json` scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b --noEmit && vite build && node scripts/postbuild.mjs",
    "preview": "vite preview --port 4173 --strictPort",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint .",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\" \"*.{ts,json,js}\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage",
    "check": "npm run typecheck && npm run lint && npm run test"
  }
}
```

```js
// scripts/postbuild.mjs — GitHub Pages deep-link fallback for a client-side router
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
const dist = join(process.cwd(), 'dist');
await copyFile(join(dist, 'index.html'), join(dist, '404.html'));
console.log('postbuild: dist/404.html written');
```

---

## 11. Testing strategy

### 11.1 Tooling

Vitest, `environment: 'node'`, tests colocated as `src/domain/date.test.ts` next to the module. `src/test/setup.ts`:

```ts
import 'fake-indexeddb/auto';
```

That is the entire setup file. Repo tests get a real (in-memory) IndexedDB; domain tests do not care.

### 11.2 Modules that MUST have tests (blocking for V1)

| Module | Required cases |
|---|---|
| `src/domain/date.ts` | every exported function; `addMonths('2026-01-31', 1) === '2026-02-28'`; `addMonths('2028-01-31', 1) === '2028-02-29'`; `addDays` across a DST boundary in a DST timezone; `diffDays` symmetric and sign-correct; `startOfWeek` for all 7 weekdays; `isLocalDate('2026-02-30') === false`; `eachWeekStart` inclusive-bounds behaviour; `msUntilNextMidnight` at 23:59:59.999 |
| `src/domain/planner/spec.ts`, `allocate.ts` (planning-engine dimension) | deadline in the past; deadline < 1 week away; zero available days/week; target === current; non-integer distribution rounding conserves the total; produced ranges (§4) never present a point estimate |
| `src/domain/planner/replan.ts`, `materialize.ts` (planning-engine dimension) | redistribution conserves remaining work; never mutates past weeks; deadline unreachable → returns a "needs a new deadline" outcome rather than an absurd weekly target (§5) |
| `src/domain/progress/**` | 0-denominator ("0 of 0 planned") renders as neutral, not 0%/failure (§5 tone); percentages clamp to `[0,100]`; metric progress with target < current (weight loss) is not negative |
| `src/domain/io/validate.ts` | rejects wrong `schemaVersion`; rejects unknown goal `type`; rejects a task whose `goalId` has no goal; rejects malformed `LocalDate`; accepts a snapshot produced by `exportSnapshot()` |
| `src/repo/backupRepo.ts` | export → import `'replace'` → export produces a deep-equal snapshot; a throw mid-import leaves the DB unchanged (assert row counts before/after) |
| `src/db/schema.ts` + future `migrations` | opening a v(n-1) fixture DB upgrades without data loss (one test per added version, added at the time the version is added) |
| `src/repo/*Repo.ts` | one happy-path CRUD test each, plus every multi-table write asserted to roll back on failure |

Coverage gates (`vitest --coverage`): `src/domain/**` and `src/repo/**` ≥ 90% lines. `src/ui/**`, `src/screens/**`, `src/app/**` are excluded from coverage — untested by design.

### 11.3 What is deliberately NOT tested in V1

No component tests, no jsdom, no E2E. Rationale: the app's correctness risk is concentrated in date math, plan distribution and import/export. Screens are thin readers of live queries. Adding RTL + jsdom would cost 4 dependencies and ongoing maintenance to assert that a checkbox renders. Revisit if the UI grows conditional logic that cannot be pushed into a pure function.

### 11.4 Manual release checklist (run before every version bump)

```
[ ] npm run check passes
[ ] npm run build && npm run preview
[ ] DevTools > Application > Service Workers: "activated and is running"
[ ] DevTools > Network: throttle "Offline" > hard-reload > app loads, Today renders
[ ] Deep link /goals/<real id> loads while offline
[ ] Install on the real Android phone; launch from the home screen; no URL bar; bottom nav sits above the gesture bar
[ ] Install on iPhone via Share > Add to Home Screen; back affordance works on every full-screen route
[ ] Create a goal, complete a task, export JSON, wipe site data, import JSON, verify identical state
[ ] Ship a trivial change, reload: update banner appears, Reload applies it
```

### 11.5 Testing the PWA from a phone during development

`npm run dev -- --host` serves on the LAN, but a `http://192.168.x.x` origin is **not a secure context**, so the service worker and `crypto.randomUUID` do not work there. Do not add an HTTPS-dev plugin for this. Instead: connect the phone by USB, open `chrome://inspect#devices` on the Windows machine, add port forwarding `5173 → localhost:5173`, and browse `http://localhost:5173` **on the phone** — Chrome treats forwarded `localhost` as secure. For iOS, run `npm run preview` and test the installed-app behaviours on the desktop first (Safari Responsive Design Mode does not install PWAs); final iOS verification requires deploying to the real HTTPS URL.

---

## 12. Hosting and deployment (zero cost)

Primary: **GitHub Pages** from the `gh-pages` branch or `/docs`-style workflow — free, HTTPS (required for service workers), static. Build with `VITE_BASE=/goal-tracker/ npm run build` for a project-site subpath; `App.tsx` already passes `import.meta.env.BASE_URL` as the router `basename`, and `scripts/postbuild.mjs` emits `404.html` so deep links survive a cold visit.

Equivalent free alternatives if a root domain is preferred: Cloudflare Pages or Netlify (drag-and-drop `dist/`), both with an SPA rewrite rule `/* → /index.html`. No server, no functions, no env secrets — there is nothing to configure beyond the rewrite.

Local-only option: the app also runs from `npm run preview` on the machine, but a service worker requires HTTPS or `localhost`, so `file://` is not supported.

---

## 13. Folder structure (exact)

```
D:\Self Project\Goal Tracker\
├─ .gitattributes
├─ .gitignore                       # node_modules, dist, dev-dist, coverage, *.local
├─ .prettierrc.json
├─ eslint.config.js
├─ index.html
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts                   # includes the Vitest `test` block
├─ docs/
│  └─ SPEC.md
├─ scripts/
│  └─ postbuild.mjs
├─ public/
│  ├─ favicon.svg
│  ├─ robots.txt                    # User-agent: *  /  Disallow: /   (§19)
│  └─ icons/
│     ├─ icon-192.png
│     ├─ icon-512.png
│     ├─ icon-512-maskable.png
│     └─ apple-touch-icon-180.png
└─ src/
   ├─ main.tsx                      # imports styles, mounts <App/>, installs SW + db lifecycle
   ├─ App.tsx                       # createBrowserRouter + providers + ErrorBoundary
   ├─ routes.tsx
   ├─ vite-env.d.ts                 # /// <reference types="vite/client" /> + vite-plugin-pwa/react
   │
   ├─ app/
   │  ├─ TabLayout.tsx              + TabLayout.module.css
   │  ├─ FullLayout.tsx             + FullLayout.module.css   (always renders a back header)
   │  ├─ BottomNav.tsx              + BottomNav.module.css
   │  ├─ ScreenHeader.tsx           + ScreenHeader.module.css
   │  ├─ ErrorBoundary.tsx          + ErrorBoundary.module.css
   │  ├─ UpdateBanner.tsx           + UpdateBanner.module.css
   │  ├─ ThemeEffect.tsx
   │  └─ providers/
   │     ├─ AppProviders.tsx        (composes the three below)
   │     ├─ ToastProvider.tsx       + Toast.module.css
   │     ├─ ConfirmProvider.tsx     + Confirm.module.css
   │     └─ UpdateProvider.tsx
   │
   ├─ screens/
   │  ├─ NotFoundScreen.tsx
   │  ├─ today/
   │  │  ├─ TodayScreen.tsx         + TodayScreen.module.css
   │  │  ├─ WeekSummaryRow.tsx
   │  │  └─ TaskList.tsx
   │  ├─ goals/
   │  │  ├─ GoalsScreen.tsx
   │  │  ├─ GoalDetailScreen.tsx
   │  │  ├─ GoalFormScreen.tsx      (mode: 'create' | 'edit')
   │  │  └─ PlanReviewScreen.tsx    (§4 edit the generated plan before saving)
   │  ├─ plan/
   │  │  ├─ PlanScreen.tsx
   │  │  └─ WeekDetailScreen.tsx
   │  ├─ progress/
   │  │  ├─ ProgressScreen.tsx      (lazy chunk; owns the chart dependency)
   │  │  └─ charts/                 (visualization dimension)
   │  └─ more/
   │     ├─ MoreScreen.tsx
   │     ├─ BackupScreen.tsx        (§15 export/import, storage status, install help)
   │     ├─ SettingsScreen.tsx
   │     └─ AboutScreen.tsx
   │
   ├─ ui/                           # presentational only; no data access
   │  ├─ Button.tsx                 + Button.module.css
   │  ├─ IconButton.tsx
   │  ├─ Checkbox.tsx               + Checkbox.module.css   (≥48px hit area)
   │  ├─ Field.tsx / NumberField.tsx / DateField.tsx / SelectField.tsx
   │  ├─ ProgressBar.tsx            + ProgressBar.module.css
   │  ├─ Stat.tsx
   │  ├─ Sheet.tsx                  (bottom sheet, <dialog> based)
   │  ├─ EmptyState.tsx
   │  ├─ Skeleton.tsx
   │  ├─ ScreenFallback.tsx
   │  └─ icons.tsx                  (inline SVG, no icon package)
   │
   ├─ hooks/
   │  ├─ useLive.ts
   │  ├─ useToday.ts
   │  ├─ useSettings.ts
   │  ├─ useGoals.ts
   │  ├─ useActivities.ts
   │  ├─ useTasks.ts
   │  ├─ useWeeklyPlans.ts
   │  ├─ useEntries.ts
   │  ├─ useToast.ts / useConfirm.ts / useUpdate.ts
   │  └─ useInstallPrompt.ts
   │
   ├─ domain/                       # PURE. no react, no dexie, no side effects
   │  ├─ types.ts                   (data-model dimension)
   │  ├─ defaults.ts                (DEFAULT_SETTINGS)
   │  ├─ date.ts                    + date.test.ts
   │  ├─ ids.ts
   │  ├─ format.ts                  (numbers, units, "2 / 3" strings — ux dimension)
   │  ├─ planner/                   (PLANNING-ENGINE.md: spec.ts, allocate.ts, replan.ts, materialize.ts) + *.test.ts
   │  ├─ units.ts                   + units.test.ts   (DATA-MODEL.md §3 — canonical/display units)
   │  ├─ progress/                  (+ visualization inputs) + *.test.ts
   │  └─ io/
   │     ├─ types.ts                (BackupSnapshot — data-io dimension)
   │     ├─ validate.ts             + validate.test.ts
   │     └─ migrateSnapshot.ts      (older backup schemaVersion → current)
   │
   ├─ repo/                         # the ONLY Dexie callers
   │  ├─ index.ts                   (re-exports the namespaced repos)
   │  ├─ goalRepo.ts
   │  ├─ activityRepo.ts
   │  ├─ milestoneRepo.ts
   │  ├─ weeklyPlanRepo.ts
   │  ├─ taskRepo.ts
   │  ├─ entryRepo.ts
   │  ├─ settingsRepo.ts
   │  ├─ trashRepo.ts               (§8 delete/undo — DATA-MODEL.md §6.3)
   │  ├─ planWriteRepo.ts           (§4/§5 multi-table plan writes, one transaction)
   │  └─ backupRepo.ts              + backupRepo.test.ts
   │
   ├─ db/
   │  ├─ database.ts                (the single Dexie instance)
   │  ├─ schema.ts                  (+ schema.test.ts once version 2 exists)
   │  ├─ lifecycle.ts
   │  └─ persistence.ts
   │
   ├─ pwa/
   │  ├─ register.ts
   │  ├─ installPrompt.ts
   │  └─ platform.ts                (isIOS, isStandalone)
   │
   ├─ styles/
   │  ├─ reset.css
   │  ├─ tokens.css
   │  └─ global.css
   │
   └─ test/
      ├─ setup.ts                   (import 'fake-indexeddb/auto')
      └─ factories.ts               (makeGoal(), makeTask() … for repo/domain tests)
```

### `src/main.tsx` (boot order matters)

```tsx
import './styles/reset.css';
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Service-worker registration is **not** here — it is started by `UpdateProvider` on mount, after the first paint, so SW installation never competes with rendering the Today screen. Dexie opens lazily on the first query, so there is no blocking "open the database" step before first paint either: Today renders its skeleton immediately and fills in within a frame or two.

---

## 14. Performance budget

| Metric | Budget | Enforcement |
|---|---|---|
| Initial JS (gzipped, excluding `/progress`) | ≤ 160 kB | `vite build` prints chunk sizes; a PR that exceeds it must justify |
| `/progress` lazy chunk | ≤ 80 kB gz | chart-library choice constraint |
| CSS total | ≤ 20 kB gz | tokens + modules, no framework |
| Today screen interactive, warm PWA start, mid-range Android | < 1.0 s | manual check on the real device |
| Precache size | ≤ 1.5 MB | mostly icons |

`React.StrictMode` stays on in development (double-invokes effects, catching the exact kind of `setInterval` leak the SW updater and `useToday` could introduce).

---

## 15. Explicitly deferred (and why the architecture is not cornered)

| V2 feature (§20) | Why V1 is not blocking it |
|---|---|
| Cloud sync | Every entity has a stable UUID id and an `updatedAt` field (data-model contract), and every write already goes through `repo/`. A sync layer slots in beside `db/` without touching screens. |
| Accounts | No user-scoping exists, but adding a `userId` column is a Dexie `version(n).upgrade()` — exactly the migration mechanism already in place. |
| AI-generated plans | The planning engine is a pure function `plan(input) → PlanDraft`; an alternative generator returning the same `PlanDraft` needs no UI change, and the Plan Review screen (§4) already exists to edit the result. |
| Notifications | Adding `showNotification` inside the existing service worker is additive; `registerType: 'prompt'` and `injectRegister: null` already leave us in control of registration. If push is ever needed, `strategies` flips to `injectManifest` with a hand-written `src/sw.ts` — a contained change. |
| Health integrations | `TrackEntry` rows have a `source` field (DATA-MODEL.md §3); importers write rows through `entryRepo`. |

No V2 abstraction is built now: no plugin registry, no repository interface with a second implementation, no event bus. The insurance is *shape* (UUIDs, transactions, pure planning, one persistence layer), not *machinery*.

---

## 16. Open questions for the user (product judgement only)

1. **Deployment target.** GitHub Pages under a project subpath (`/goal-tracker/`) vs a custom free domain (Cloudflare Pages). Affects `VITE_BASE` only; default assumed is GitHub Pages project subpath.
2. **Primary device.** iPhone vs Android changes how much weight the iOS storage-eviction warnings and export nudges deserve on `/more/backup`. Default assumed: both, with iOS-safe behaviour everywhere.
