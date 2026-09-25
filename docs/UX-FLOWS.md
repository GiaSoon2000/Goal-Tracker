# UX Flows — Screens, Wizard, Quick-Log, Design Tokens

**Scope:** spec §6–§11 and §17. Routing, the app shell, and the token *mechanism* are owned by [ARCHITECTURE.md §3/§7](ARCHITECTURE.md); several dialogs (delete-goal, quota, storage gate, clock banner, import review) and the confirm/undo matrix are already fully specified in [EDGE-CASES.md §H](EDGE-CASES.md). This document is the screen-by-screen content spec, the goal-creation wizard, the quick-log flows, and the token *values* those mechanisms render.

All wireframes are drawn at **390px width** (a common small-phone viewport) with a 16px gutter.

## 0. Decisions

| Decision | Rationale | Rejected alternative |
|---|---|---|
| **Today's content order is fixed: week-progress strip, then today's tasks, then nothing else.** | §7's own example has exactly this order and nothing more; §17 wants the answer in "a few seconds". Anything else (tips, streaks, motivational copy) competes for that budget. | A "goals needing attention" third section — §7 asks for it, but a stale/behind goal is already visible in the week-progress strip's own status color; a separate section would duplicate it. |
| **Task completion is a single tap on the row, no swipe, no separate checkbox target that's smaller than the row.** | §7 "easy to complete with one tap" — the whole row is the target (≥48px tall), removing the classic tiny-checkbox mis-tap problem on mobile. | A leading checkbox icon as the only hit target — fails the 48px guidance for a *reliable* tap, not just a technically-compliant one. |
| **The goal-creation wizard is 5 steps, each answerable in one glance, with the last step being the editable plan preview.** | §17 "avoid complicated forms" + §4 "the user must be able to edit the generated plan" — both are satisfied by keeping every step to 1–2 fields and ending on the one screen where editing matters. | A single long form — faster for a power user, worse for the "30 seconds" goal and worse at surfacing the plan preview as a distinct, reviewable moment. |
| **Quick-log is a bottom sheet reachable in ≤2 taps from Today, never a full-screen route.** | §11/§12 logging must be frictionless daily. A sheet keeps Today's context visible underneath (you can see *why* you're logging) and closes with one tap on success. | A dedicated `/log` screen — an extra back-navigation for the single most frequent action in the app. |
| **Color never carries the only signal.** Every status (on-track/behind/ahead, missed, done) pairs a color with a short word or icon. | §17 accessibility is table-stakes for a personal daily-use tool; EDGE-CASES.md D20 already forbids red for "missed" — this generalizes that rule to every status surface. | Color-only badges — fails colorblind users and fails EDGE-CASES.md's own tone rule the moment a screen is styled without checking back against it. |
| **Charts render inline in the Goal Detail screen for that goal's own metric; the Progress tab is the only place cross-goal comparisons live.** | §9 shows a single goal's trajectory in context; §13's fuller visualization (heatmaps, monthly consistency) belongs where the user goes specifically to review progress, not embedded in every screen. | Full charts on Goal Detail *and* Progress — duplicated code and a Goal Detail screen that no longer reads as "goal at a glance". |

---

## 1. Screen index

| Screen | Route | Spec | Nav |
|---|---|---|---|
| Today | `/today` | §7 | tab |
| Goals | `/goals` | §8 | tab |
| Goal Detail | `/goals/:goalId` | §9 | back header |
| New/Edit Goal (wizard) | `/goals/new`, `/goals/:goalId/edit` | §4, §8, §17 | back header |
| Plan Review | `/goals/:goalId/plan-review` | §4 | back header |
| Plan | `/plan` | §10 | tab |
| Week Detail | `/plan/:weekStart` | §10 | back header |
| Progress | `/progress` | §13 | tab |
| More | `/more` | §6 | tab |
| Backup | `/more/backup` | §15 | back header |
| Settings | `/more/settings` | §16 | back header |

Route mechanics, shell, and bottom nav are [ARCHITECTURE.md §3](ARCHITECTURE.md); this document only adds per-screen content.

---

## 2. Today (`/today`) — §7

**The one-glance question:** *What should I do today, and how is this week going?* Everything below the header must be legible without scrolling on a 667px-tall screen (iPhone SE class).

```
┌──────────────────────────────────────┐ safe-area-inset-top
│  Today                       Thu 19  │ sticky header
├──────────────────────────────────────┤
│                                      │
│  ● Fitness      2 / 3 workouts   →  │  week-progress row, tap → Goal Detail
│  ● Singing      5 / 7 practice   →  │  ● = status dot (on-track/behind/ahead)
│  ▲ Piano        0 / 1 sessions   →  │  ▲ = behind (shape, not just color)
│                                      │
│  Today                              │
│  ┌────────────────────────────────┐ │
│  │ ○  Workout                     │ │  ← full-row tap target, ≥56px tall
│  │    45 min · Fitness            │ │
│  ├────────────────────────────────┤ │
│  │ ●  Singing practice — 30 min   │ │  ● = done (struck-through title,
│  │    3 steps · Singing           │ │       muted, stays visible — no
│  ├────────────────────────────────┤ │       vanish-on-complete)
│  │ ○  Piano — chords practice     │ │
│  │    25 min · Piano              │ │
│  └────────────────────────────────┘ │
│                                      │
│  ﹢ Log something                   │  secondary action, opens quick-log sheet
│                                      │
├──────────────────────────────────────┤
│  ◷      ◎      ▤      ◻      ⋯       │  bottom nav
└──────────────────────────────────────┘
```

**Week-progress row** (one per active, non-paused goal, ordered by `Goal.sortOrder`):
- Left: status dot/shape (●on-track #16A34A / ▲behind #D97706-shape-not-just-color / ✦ahead #2563EB / — no-data #94A3B8) + goal name.
- Right: the goal's primary input tally this week — `"{actual} / {target} {unit-noun}"` from `summarizeWeek()` (DATA-MODEL.md §3.2), the **first `role:'input'` row with a target**, not every activity (keeps the row to one line; the rest is one tap away).
- Tapping the row navigates to Goal Detail. No inline expand — §17 "one primary action per screen" reads at the row level too: the row's action is "see more", not "do more".

**Today's Tasks list** — from `tasks.where('[date+sortOrder]').equals(today)` (DATA-MODEL.md §4.4), including already-`done`/`skipped` rows (so completing one doesn't make it disappear and reshuffle the list — a small but real stability win for a list the user re-checks all day). Sort: `pending` first, then `done`, then `skipped`, each group by `sortOrder`.

**Task row states:**
| State | Leading mark | Title style |
|---|---|---|
| `pending`, today or a same-day-earlier item | `○` outline | normal |
| `done` | `●` filled, `#16A34A` | strikethrough, `#656B76` (muted, not hidden) |
| `skipped` | `–` dash, `#9AA1AC` | italic, `#9AA1AC` |
| collapsed "Earlier" group (EDGE-CASES.md EC-K03, tasks >24h stale still pending) | — | a single row: `"3 earlier tasks ▾"`, tap to expand in place |

**Tap behavior:** tapping anywhere on a `pending` row calls `completeTask` immediately (DATA-MODEL.md §4.5) — no confirm, no intermediate state — then shows a small inline check animation (≤150ms, respects `prefers-reduced-motion`) and a bottom toast `"Done" [Undo]` (4s). Tapping a `done` row calls `uncompleteTask` (same idempotent round-trip). A task with `steps.length > 0` (singing/piano-style breakdowns, §11) instead opens an inline expand **within the row** showing its steps as their own one-tap checkboxes; the parent completes automatically when the last step does (EDGE-CASES.md EC-K11).

```
│ ○  Singing practice — 30 min   │  ← tap the row itself
├─────────────────────────────────┤
│    ○ Breathing — 5 min         │  ← steps appear inline, indented
│    ○ Vocal warm-up — 10 min    │     each its own 48px tap target
│    ○ Song practice — 15 min    │
```

**Empty state** (no active goals yet): replaces the whole page body with `EmptyState` — icon, *"No goals yet"*, one primary button `[Create a goal]` → wizard. No week-progress rows, no task list, no "Log something" (there is nothing to log against).

**Stale-goal prompt** (EDGE-CASES.md EC-U05, 21 days no activity): a single neutral row above the task list, not a modal — *"Fitness — no activity since Aug 8. [Keep going] [Pause] [Archive]"*.

---

## 3. Goals (`/goals`) — §8

```
┌──────────────────────────────────────┐
│  Goals                          ﹢   │  ← the ONE primary action (§17)
├──────────────────────────────────────┤
│ ┌────────────────────────────────┐  │
│ │ Fitness                    ⋯   │  │  ⋯ opens the actions sheet
│ │ 43 → 50 kg                     │  │
│ │ ▓▓░░░░░░░░░░░░░░░░░░  7%       │  │  ProgressBar, clamped [0,1] (D22)
│ │ Deadline: March 2027           │  │  formatMonthYear of resolveDeadline
│ └────────────────────────────────┘  │
│ ┌────────────────────────────────┐  │
│ │ Singing                    ⋯   │  │
│ │ Daily practice                 │  │  habit goals: no % (DATA-MODEL §3.2)
│ │ 5 / 7 this week                │  │  — trailing adherence instead
│ └────────────────────────────────┘  │
│ ┌────────────────────────────────┐  │
│ │ Piano                      ⋯   │  │
│ │ 5 songs                        │  │
│ │ ▓▓▓▓░░░░░░░░░░░░░░░  20%       │  │  skill-ladder ratio (DATA-MODEL §3.2)
│ │ Current: Basic chords          │  │
│ └────────────────────────────────┘  │
│                                      │
│  Paused (1)                      ▾  │  collapsed section, tap to expand
│  Archived (2)                    ▾  │  collapsed section
└──────────────────────────────────────┘
```

Cards are **one per goal**, minimal borders (§17 "avoid excessive cards" — a flat 1px `--border` divider between rows reads as a list, not a stack of shadowed cards). Order: `active` goals by `sortOrder` (drag-to-reorder, long-press), then collapsed `Paused`/`Archived` sections (empty sections are hidden entirely, not shown as "(0)").

**`⋯` actions sheet:** Edit · Pause/Resume · Archive/Unarchive · Delete (red text, bottom, separated by a divider — the one visually "louder" item in an otherwise plain list, per the confirm/undo matrix in EDGE-CASES.md §H.1).

**Empty state:** same `EmptyState` pattern as Today, `[Create a goal]`.

---

## 4. Goal Detail (`/goals/:goalId`) — §9

```
┌──────────────────────────────────────┐
│  ‹ Back            Fitness      ⋯   │
├──────────────────────────────────────┤
│  43 kg → 50 kg                      │
│  Current: 43.5 kg                   │  latestEntry(outcome activity), formatEntry()
│                                      │
│  ▓▓░░░░░░░░░░░░░░░░░░  7%           │
│  Deadline: March 2027 · 27 wks left │
│                                      │
│  [——— line chart, 43→50 band ———]   │  ~140px tall; see PROGRESS section below
│                                      │
│  This week                    ● On track
│  Workout        ▓▓░  2 / 3          │
│  Weight logs    ▓▓▓  3 / 3          │
│                                      │
│  Upcoming milestones                │  metric goals: hidden if none exist
│  ○ (none for this goal)             │
│                                      │
│  Recent activity                    │
│  Weight  43.5 kg           Today    │
│  Workout done               Yest.   │
│  Weight  43.7 kg          2d ago    │
│                       [See all →]   │
└──────────────────────────────────────┘
```

For a **skill/project** goal, the header swaps the metric block for milestone-forward framing:

```
│  5 songs                            │
│  ▓▓▓▓░░░░░░░░░░░░░  20% (1 of 5)    │
│  Current milestone: Basic chords    │
│  Next: Major scales · target Jan 25 │
```

**Content blocks, in this fixed order** (matches §9's own listing): identity + current/target, overall progress, this-week status, upcoming milestones, recent activity. Each block may be empty (habit goals: no target/current; open-ended goals: no deadline countdown) but the **order never changes** — a user who knows the layout for one goal type can predict it for another.

**This week status badge** (`● On track` / `▲ Behind` / `✦ Ahead` / `— No data yet`) uses `weekBand()` (PLANNING-ENGINE.md §6) — shape + word + color, never color alone.

**`⋯` menu:** Edit goal · Re-plan (only shown when `status: 'active'` and at least one past-due elastic week exists) · Pause/Archive/Delete (shared with Goals screen's sheet).

---

## 5. Plan (`/plan`) — §10

```
┌──────────────────────────────────────┐
│  Plan                                │
├──────────────────────────────────────┤
│  Current week          Sep 14–20  →  │  pinned to top, tap → Week Detail
│  Fitness   Workout 3 · Weight 3      │
│  Singing   Practice 6                │
│  Piano     Sessions 3                │
├──────────────────────────────────────┤
│  September 2026                      │
│  Week of Sep 7–13              ✓     │  ✓ = week fully in the past, closed
│  Week of Sep 14–20         (current) │
│                                       │
│  October 2026                        │
│  Week of Sep 28 – Oct 4         →    │  straddling week files under Sep (D11)
│  Week of Oct 5–11               →    │
└──────────────────────────────────────┘
```

One row per materialized week (up to `MAX_MATERIALIZED_WEEKS` ahead, PLANNING-ENGINE.md §9); weeks beyond the window render dimmed with no `→` (not yet editable, per EDGE-CASES.md's virtual-week rule) rather than being omitted — the user can see the plan continues without the app pretending every week already has committed numbers.

## 5.1 Week Detail (`/plan/:weekStart`)

```
┌──────────────────────────────────────┐
│  ‹ Back        Sep 14 – 20      Edit │  the ONE primary action per §17
├──────────────────────────────────────┤
│  Fitness                             │
│    Workout        target 3   done 2  │
│    Weight logs     target 3   done 3 │
│  Singing                             │
│    Practice        target 6   done 5 │
│  Piano                               │
│    Sessions         target 3  done 0 │
│                                       │
│  ⓘ Generated — [Reset to suggested]  │  only shown when source:'edited'
└──────────────────────────────────────┘
```

Tapping `Edit` turns each target row into a `NumberStepper` in place (no navigation) with `Save`/`Cancel` replacing the header's `Edit`; saving sets `WeeklyPlan.source: 'edited'` and regenerates only that week's `pending` tasks (EDGE-CASES.md EC-K08). The re-plan preview sheet (deadline changes, "adjust future weeks") is fully specified in EDGE-CASES.md §B.3 and is not duplicated here — this screen is where a user reaches it via a **"Re-plan from here"** link when the week reads Behind.

---

## 6. Progress (`/progress`) — §13

A goal picker (segmented control or a simple dropdown when >4 goals) at the top, then per-goal visualizations stacked vertically:

```
┌──────────────────────────────────────┐
│  Progress          [Fitness ▾]       │
├──────────────────────────────────────┤
│  Weight                              │
│  [—— line: entries + band ——]  ~160px│
│                                       │
│  Weekly consistency (last 8 weeks)   │
│  [▁▃▅▇▇▅▃▁]  planned-vs-actual bars  │
│                                       │
│  Milestones                          │
│  ●───●───○───○  2 of 4 complete      │
└──────────────────────────────────────┘
```

For a **habit-only** goal (Singing), the metric line chart block is omitted and a calendar heatmap (last 12 weeks, 7 columns) replaces it as the primary visual. Exact chart types, color scales, and the progress-math they render are DATA-MODEL.md §3.2's job, not this document's — this section only fixes *placement and order*: metric trend (if any) → weekly consistency → milestones (if any), top to bottom, one goal at a time, never a dashboard of every goal's every chart at once (§17 "communicate progress quickly without overwhelming").

---

## 7. Goal creation wizard — §4, §8, §17

Five steps, a progress dots indicator in the header, back/next as the header's leading/trailing actions (no separate footer button bar — keeps the "one primary action" rule even inside a multi-step flow).

```
Step 1 — Type          Step 2 — Basics         Step 3 — Timeline
┌──────────────────┐   ┌──────────────────┐    ┌──────────────────┐
│ ‹  ••••○   Next › │   │ ‹  ••••○   Next › │   │ ‹  ••••○   Next › │
│ What kind of goal? │   │ Fitness            │   │ Start      Today  │
│ ○ Metric  ○ Habit  │   │ ┌────────────────┐│   │ Deadline   ▾      │
│ ○ Skill  ○ Project │   │ │ Weight change  ││   │  March 2027        │
│                    │   │ │ Running        ││   │ (month picker —    │
│ (metric selected → │   │ │ Savings        ││   │  §2 "March 2027")  │
│  preset list below)│   │ │ Custom         ││   │                    │
└──────────────────┘   │ └────────────────┘│   └──────────────────┘
                        │ Current: 43  kg    │
                        │ Target:  50        │
                        └──────────────────┘

Step 4 — Capacity                Step 5 — Review your plan
┌──────────────────┐             ┌────────────────────────┐
│ ‹  ••••●   Next › │             │ ‹  •••••      Create   │
│ Days available     │             │ Suggested plan          │
│ ●●●●○○○  4 / week  │             │ Weight     3 logs/wk    │
│ Workload            │             │ Workout    3 sessions/wk│
│ ○ Light ● Moderate  │             │ (edit any number below) │
│           ○ Intense │             │ ┌──────────────────────┐│
└──────────────────┘             │ │ Workout    [ 3 ▾]     ││
                                    │ │ Weight log [ 3 ▾]     ││
                                    │ └──────────────────────┘│
                                    │ Trajectory: ~0.15–0.35   │
                                    │ kg/week (a range, not a  │
                                    │ prediction — §4)         │
                                    └────────────────────────┘
```

- **Step 1** picks `GoalType`; the preset list shown in Step 2 is filtered to `appliesToType` (PLANNING-ENGINE.md §2). "Custom" skips template instantiation entirely — Step 5 then shows an empty activity list with `[+ Add activity]`.
- **Step 2** fields are exactly what the chosen `GoalType`'s config needs (metric: current/target/unit; habit: nothing extra, frequency comes in Step 4; skill: current level/target outcome text; project: nothing extra, milestones come from the template). Smart defaults (unit inferred from the preset, e.g. "Weight change" defaults to `kg`) keep this to ≤2 fields.
- **Step 3**: start defaults to today; the deadline control is a **month/day toggle** so a user can pick "March 2027" (`Deadline.precision:'month'`) as directly as an exact date — this is the UI surface for DATA-MODEL.md's `Deadline` union, not a separate feature.
- **Step 4**: `availableDaysPerWeek` (a 7-dot stepper, not a text field) and `workload` (light/moderate/intense) feed `buildPlanSpec` (PLANNING-ENGINE.md §4) live — every change on this step recomputes Step 5's preview.
- **Step 5 (Plan Review)** is the one screen where §4's "must be able to edit" is literal: every generated activity target is an editable `NumberStepper` inline, milestones (if any) are an editable dated list, and a metric goal's trajectory is shown **only as a range**, worded exactly like PLANNING-ENGINE.md §0's false-precision rule demands. `Create` writes everything in one transaction (DATA-MODEL.md `PlanWriteRepo`) — nothing is persisted before this tap, so back-navigating out of the wizard at any prior step discards cleanly with no cleanup needed.

Editing an existing goal (`/goals/:goalId/edit`) reuses Steps 1–4 pre-filled (Step 1 disabled — goal type is not changeable post-creation, since Activities are already typed to it) and routes straight to Plan Review only if the deadline or capacity changed (otherwise `Save` commits directly, since most edits — renaming, tweaking a description — don't touch the plan at all).

---

## 8. Quick-log flows — §11, §12

Reachable two ways: the `﹢ Log something` row on Today (goal picker → activity picker → value sheet), or directly from a Goal Detail screen's `[+ Log]` button (skips the goal picker, one tap saved). Both end at the same bottom sheet, keyed by `Activity.kind`:

```
kind: 'metric'                    kind: 'session'
┌──────────────────────┐          ┌──────────────────────┐
│  Log weight        ✕ │          │  Log workout        ✕│
│                       │          │                       │
│  ┌─────────────────┐ │          │  Duration    45  min  │
│  │      43.5   kg  │ │          │  Intensity  ○ ○ ●     │
│  └─────────────────┘ │          │                       │
│  Date:  Today ▾       │          │  Date:  Today ▾       │
│                       │          │                       │
│        [ Save ]       │          │        [ Save ]       │
└──────────────────────┘          └──────────────────────┘
```

- Numeric fields are `type="text" inputmode="decimal"` with the locale-safe `parseDecimal` (EDGE-CASES.md EC-M09) — never `type="number"`.
- The date field defaults to `Today` and its picker's `max` is today (EDGE-CASES.md D8/EC-M06 — no future logging); past dates are freely selectable (backfill, EC-M04) with a one-line note when the picked date predates the goal's `startDate` (EC-M05).
- `duration`/`habit` kinds are a single `[Mark done]` button — no numeric field at all for `habit`; `duration` shows one `NumberField` for minutes and nothing else.
- On Save, the sheet closes with the same inline-toast pattern as task completion (`"Saved" [Undo]`), and if the entry was logged against today's already-generated task for that activity, the task auto-completes (DATA-MODEL.md `entryId` linkage) rather than leaving a duplicate open checkbox on Today.

This is the ≤2-tap path §0's decisions table commits to: Today → `+` → kind-specific sheet → Save (2 taps to open, 1 to save) for the goal-picker route, or Goal Detail → `+ Log` → Save (1 tap to open) when already on that goal's screen.

---

## 9. Component tree

Owned by [ARCHITECTURE.md §13](ARCHITECTURE.md) (exact file paths under `src/screens/`, `src/ui/`, `src/app/`). This section adds only the **internal composition** of the two content-heaviest screens, since their file tree entries are single files that hide real structure:

```
screens/today/TodayScreen.tsx
  ├─ WeekSummaryRow.tsx        (× one per active goal — status dot, name, tally, chevron)
  └─ TaskList.tsx
       └─ TaskRow.tsx           (× one per task — handles its own expand/collapse for steps)
            └─ TaskStepRow.tsx  (× one per TaskStep, only when expanded)

screens/goals/GoalFormScreen.tsx   (the 5-step wizard; mode: 'create' | 'edit')
  ├─ steps/TypeStep.tsx
  ├─ steps/BasicsStep.tsx
  ├─ steps/TimelineStep.tsx      (owns the month/day Deadline toggle)
  ├─ steps/CapacityStep.tsx
  └─ steps/PlanReviewStep.tsx
       ├─ ActivityTargetRow.tsx  (NumberStepper per activity target)
       └─ MilestoneListEditor.tsx
```

Shared primitives (`Button`, `Sheet`, `ProgressBar`, `Stat`, `NumberStepper`, `EmptyState`, etc.) are the list already fixed in ARCHITECTURE.md §13's `src/ui/` tree — no new primitives are introduced by this document; `WeekSummaryRow`, `TaskRow`, `ActivityTargetRow` and `MilestoneListEditor` are the only screen-specific components this document adds, and they compose existing primitives rather than styling anything themselves.

---

## 10. Design tokens (values)

Mechanism (`tokens.css`, dark-mode override structure, theme setting) is ARCHITECTURE.md §7. Values:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#121316` | page background |
| `--surface` | `#FFFFFF` | `#191B1F` | cards, sheets |
| `--surface-2` | `#F4F5F7` | `#212429` | list-row hover/pressed |
| `--border` | `#E3E5E9` | `#2C3037` | dividers |
| `--fg` | `#16181D` | `#ECEEF2` | primary text |
| `--fg-muted` | `#656B76` | `#9AA1AC` | secondary text, done-task titles |
| `--accent` | `#2F6BFF` | `#7EA2FF` | primary actions, active nav |
| `--on-track` | `#16A34A` | `#4ADE80` | status dot/badge |
| `--behind` | `#D97706` | `#FBBF24` | status dot/badge (paired with ▲ shape, never alone) |
| `--ahead` | `#2563EB` | `#60A5FA` | status dot/badge (paired with ✦ shape) |
| `--missed` | `#F1F5F9` bg / `#475569` text | `#1E293B` bg / `#94A3B8` text | never red (EDGE-CASES.md D20) |
| `--danger` | `#C0392B` | `#F08076` | delete-goal confirm, quota errors |

Type scale: `13px` caption, `15px` body (default), `17px` row-title, `20px` screen-title, `28px` stat/current-value — a 5-step scale, no more (§17 "minimal unnecessary text" applies to type variety too). Spacing/radius/touch-target/nav-height constants are ARCHITECTURE.md §3.2's already-fixed geometry (`--space-1..6`, `--radius: 12px`, `--tap: 48px`).

## 11. Accessibility

- Every status that uses color also uses a shape or word (§0's decision, applied throughout §2–§6 above).
- All interactive rows meet the 48px minimum touch target (ARCHITECTURE.md `--tap`); the Today task row is 56px specifically because it is the single most-tapped element in the app.
- Focus-visible rings on every control (ARCHITECTURE.md `global.css`); the wizard's step dots are `aria-current="step"` on the active one.
- `prefers-reduced-motion: reduce` disables the task-completion check animation and any sheet slide-transition, falling back to an instant show/hide (ARCHITECTURE.md `reset.css` already sets this globally).
- Numeric inputs carry `inputmode="decimal"` (not `type="number"`) both for the locale-safe parsing (EDGE-CASES.md EC-M09) and because `type="number"` spinner arrows are a poor touch target.
- Dynamic type: the type scale uses `rem`, so a user's OS text-size setting scales the whole app; no fixed-`px` text below the 13px caption floor.
