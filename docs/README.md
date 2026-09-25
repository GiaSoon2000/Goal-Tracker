# Goal Backward Planner

A mobile-first PWA that turns a long-term goal into what you should actually do this week and today — not a generic to-do list. You set a goal and a deadline; the app suggests milestones, weekly targets, and daily tasks by working backward from the deadline, and it re-plans honestly (never as "you failed") when reality doesn't match the plan.

**Core concept:** Goal → Deadline → Milestones → Weekly Targets → Daily Tasks → Tracking → Progress → Re-planning.

**Stack, one line:** Vite + React 19 + TypeScript, Dexie (IndexedDB) as the only state layer via `useLiveQuery`, installable offline-first PWA, zero backend, zero accounts, zero paid services. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full reasoning and the exact dependency list.

## Documents

| Doc | Covers |
|---|---|
| [SPEC.md](SPEC.md) | The original product specification, verbatim, plus environment facts. The source of every `§N` reference in the other docs. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, layering, routing, state management, PWA/offline, build & test setup, folder structure. |
| [DATA-MODEL.md](DATA-MODEL.md) | The canonical TypeScript types, IndexedDB schema and indexes, date/unit handling, migrations, export format. Source of truth for every type name used elsewhere. |
| [PLANNING-ENGINE.md](PLANNING-ENGINE.md) | The backward-planning algorithm: goal templates, milestone scaffolding, weekly-target generation, daily-task generation, re-planning, worked examples for Fitness/Singing/Piano. |
| [UX-FLOWS.md](UX-FLOWS.md) | Screen-by-screen wireframes, the goal-creation wizard, quick-log flows, component tree, design tokens. |
| [EDGE-CASES.md](EDGE-CASES.md) | The failure-mode catalogue: time/timezone, goal lifecycle, tracking/units, tasks, storage, import/export, UX safety — each with a trigger, the naive failure, and the decided handling. |

Read them in that order once; after that, treat DATA-MODEL.md as the reference for "what is this type called" and EDGE-CASES.md as the reference for "what happens if X goes wrong."

## How these were produced

Per the spec's own §21 ("propose the architecture... before writing application code"), each area above was drafted independently, then reconciled by hand for cross-document consistency — naming (`Activity`/`activityId` as the one name for a goal's trackable streams; `LocalDate` as the one name for a civil-date string), a few genuine design gaps one draft caught that another missed (month-precision deadlines like "March 2027"; canonical-vs-display unit storage so switching kg↔lb never rewrites history), and one library disagreement resolved in favor of the smaller dependency footprint (hand-written validators, no schema library). Where a document says "X is authoritative, see doc Y," Y is the version to implement from.

## Getting started (once code exists)

```powershell
cd "D:\Self Project\Goal Tracker"
npm ci
npm run dev        # http://localhost:5173
npm run check      # typecheck + lint + test, before every commit
npm run build       # dist/ — deployable to any static host (GitHub Pages, Cloudflare Pages, Netlify)
```

No environment variables, no API keys, no backend to run. See ARCHITECTURE.md §12 for zero-cost hosting and §11.4 for the manual PWA release checklist (offline check, install check, export/import round-trip).

## V1 scope

Everything in spec §20's "Must Have" list; nothing from "Nice to Have Later" (cloud sync, accounts, AI-generated plans, notifications, health-app integrations) unless the architecture needed to leave room for it anyway (it does — see ARCHITECTURE.md §15).
