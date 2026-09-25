# Planning Engine — Backward Planning, Templates, and Re-planning

**Scope:** the pipeline in spec §4 — Goal → Milestones → Monthly targets → Weekly targets → Daily tasks — plus re-planning (§5). This is the app's core differentiator; everything here is a pure function over the types in [DATA-MODEL.md](DATA-MODEL.md).

This document owns what the other docs deliberately left as a gap: **how a newly created goal turns into a populated set of Activities, Milestones and a first week of targets** — the templates mechanism, milestone scaffolding, and daily-task generation. Feasibility codes, the redistribution/re-plan algorithm, allocation math, and materialization windows were already fully designed in [EDGE-CASES.md §F](EDGE-CASES.md) and [§B.2](EDGE-CASES.md); this document adopts them as-is and does not restate their code, only their contract and the numbers that changed when reconciled here.

## 0. Decisions

| Decision | Rationale | Rejected alternative |
|---|---|---|
| **A small static `GOAL_TEMPLATES` registry maps a user-picked preset to a starting set of Activities/Milestones, entirely local, no AI.** | §4 needs a plan *suggested*, not demanded — but the wizard has to suggest *something* the moment a goal type is picked, and "an empty form" fails §17's "avoid complicated forms". A template is transparent, inspectable, and instantly editable (§4 "the user must be able to edit the generated plan"). | An LLM call — needs a paid API and a network round-trip, both explicitly ruled out (§14, §19); a from-scratch heuristic per goal — reinvents the same lookup table with more code. |
| **Every template output is written into a real, editable draft (Activities + Milestones + a first `WeeklyTarget[]`) that the Plan Review step lets the user edit BEFORE the goal is saved.** | The suggestion must never silently become "the truth" — §4's most important sentence. Editing after creation is a second-class experience; editing the actual draft before commit is one screen, one mental model. | Save immediately, edit later — a user who never opens Edit is stuck with a suggestion they didn't choose. |
| **First and last weeks are prorated by remaining/available slots, never a ramp-up curve.** | A ramp-up (start light, build up) is a plausible personal-training idea but is itself a prediction about how the user *should* feel — outside this app's remit (§4 "avoid presenting uncertain real-world progress as exact predictions" extends to prescriptions, not just readouts). Proration is pure arithmetic, not a training philosophy. | A 4-week ramp — an opinionated feature with no basis in the spec, and one more thing to explain and let the user override. |
| **Metric-goal weekly "targets" shown to the user are always the supporting HABITS (workouts, weigh-ins), never a fabricated weekly weight quota.** | §4's own worked example proves the point: 43→50 kg over ~78 weeks is 0.09 kg/week — below a bathroom scale's noise floor. Presenting it as a weekly number is false precision the spec explicitly forbids. The metric itself is tracked and charted with an **outcome band** (DATA-MODEL.md §3.2), never a weekly pass/fail. | A weekly weight delta target — mathematically present but practically meaningless, and it invites exactly the "you failed" framing §5 rules out. |
| **Milestones for SKILL/PROJECT goals are template-scaffolded but date-spread by even division across the timeline, not by estimated difficulty.** | The app has no basis to know that "scales" take longer than "chords" for a specific user. Even spacing is honest about that ignorance; the user drags dates in the Plan Review step if they know better. | Hand-tuned relative weights per milestone — invents false confidence the design has no way to earn. |
| **Daily tasks are generated FROM a materialized `WeeklyPlan.targets`, never the other way around.** | Keeps a single direction of data flow: Goal → Activity → WeeklyPlan (numbers) → DailyTask (calendar slots). Editing a week's target regenerates only its `pending` tasks (EDGE-CASES.md EC-K08); editing a single task never silently changes the week's target. | Tasks as the source of truth, aggregated up to a "target" — makes editing one day retroactively fuzz the week's number. |

---

## 1. The pipeline, end to end

```
Goal + preset  ──► GOAL_TEMPLATES lookup ──► draft Activities + draft Milestones
                                                         │
                                                         ▼
                                    buildPlanSpec(goal, activities, today)
                                    (EDGE-CASES.md §F — feasibility + totalQuantity)
                                                         │
                                                         ▼
                                 spreadMilestones(milestones, startDate, deadline)
                                                         │
                                                         ▼
                              weekTargetsFor(spec, weekStart, weights)  (per materialized week)
                                    → prorateFirstWeek / proration for the last week
                                                         │
                                                         ▼
                           generateTasksForWeek(goal, activities, weekPlan, weekDays)
                                    → uses Activity.scheduling to place tasks on days
                                                         │
                                                         ▼
                                     Plan Review screen — user edits before Save
                                                         │
                                                         ▼
                              repo writes: goal + activities + milestones + week 1
                                              (one transaction, PlanWriteRepo)
```

Everything left of "Plan Review" runs **client-side, synchronously, in a `useMemo`** — it is pure and cheap enough (a handful of weeks) to recompute on every keystroke in the wizard, which is what makes live-editing the suggestion (§4) feel instant rather than a "regenerate" button.

---

## 2. Goal templates (`src/domain/planner/templates.ts`)

```ts
export interface ActivityDraft {
  name: string;
  kind: TrackKind;
  role: ActivityRole;
  unit: CanonicalUnit | null;
  decimals: 0 | 1 | 2;
  defaultTarget: ActivityTarget | null;
  scheduling: ActivityScheduling;
}

export interface MilestoneDraft {
  title: string;
  description?: string;
  /** Fraction of the timeline (0..1) where this milestone is suggested to land. */
  atFraction: number;
  /** For metric-like ladders only — e.g. a weight checkpoint. */
  targetValueFraction?: number; // 0..1 of the way from start to target
}

export interface GoalTemplate {
  id: string;
  label: string;                       // shown in the wizard's preset picker
  appliesToType: GoalType;
  activities: ActivityDraft[];
  milestones: MilestoneDraft[];
  /** Prefilled wizard defaults; the user can still change every one of these. */
  suggestedAvailableDaysPerWeek: number;
  suggestedWorkload: 'light' | 'moderate' | 'intense';
}

export const GOAL_TEMPLATES: Record<string, GoalTemplate> = { /* … §2.1–§2.6 */ };

/** Applies a template to a concrete goal timeline, producing editable drafts. */
export function instantiateTemplate(
  template: GoalTemplate,
  goal: Pick<Goal, 'startDate' | 'deadline'>,
): { activities: ActivityDraft[]; milestones: MilestoneDraft[] };
```

A template is deliberately **dumb data**, not a generator function — every field is directly what ends up in an `Activity`/`Milestone` row (modulo dates, which `instantiateTemplate` resolves against the goal's actual timeline). This is what makes the Plan Review screen able to show and edit the draft with the exact same components used everywhere else in the app: there is no special "template edit mode".

The wizard's type step offers presets scoped to the chosen `GoalType` (§3 of the spec); "Custom" is always the last option and skips straight to an empty Activity list the user builds by hand.

### 2.1 Metric — weight change (Fitness, §2)

```ts
weightChange: {
  id: 'weightChange', label: 'Change my weight', appliesToType: 'metric',
  activities: [
    { name: 'Weight', kind: 'metric', role: 'outcome', unit: 'kg', decimals: 1,
      defaultTarget: { aggregate: 'count', amount: 3, band: null, compare: null },
      scheduling: { mode: 'none', defaultMinutes: null, stepTemplate: [] } },
    { name: 'Workout', kind: 'session', role: 'input', unit: null, decimals: 0,
      defaultTarget: { aggregate: 'count', amount: 3, band: { min: 2, max: 4 }, compare: null },
      scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [1, 3, 5],
                    defaultMinutes: 45, stepTemplate: [] } },
  ],
  milestones: [],                      // a metric goal tracks a trajectory, not checkpoints, in V1
  suggestedAvailableDaysPerWeek: 4, suggestedWorkload: 'moderate',
}
```

The "Weight" activity's own `defaultTarget` (3 logs/week) is a **logging cadence**, not a change target — this is the mechanism that makes "workout 3×, weigh-in 3×" appear automatically for a goal the user only described as "43 → 50 kg": the template ships both streams because the spec's own worked example (§2) shows both, and *this is exactly how the template earns its place* — a bare metric-goal wizard step has no way to know a weigh-in cadence and a workout habit both belong to "Fitness" without either an AI call (ruled out, §0) or a lookup table (this one). A **running-distance** or **savings** goal reuses the same shape with only the outcome activity's unit/name changed and the input activity dropped or replaced (`savingsGoal` template ships only the outcome stream — there is no "input habit" for saving money that the app can usefully prescribe).

### 2.2 Habit — daily/weekly practice (Singing, §2)

```ts
singingPractice: {
  id: 'singingPractice', label: 'Practice singing', appliesToType: 'habit',
  activities: [
    { name: 'Practice', kind: 'duration', role: 'input', unit: 'min', decimals: 0,
      defaultTarget: { aggregate: 'count', amount: 6, band: null, compare: null },
      scheduling: { mode: 'daysPerWeek', daysPerWeek: 6, preferredDays: [1,2,3,4,5,6],
                    defaultMinutes: 30,
                    stepTemplate: [
                      { title: 'Breathing', minutes: 5 },
                      { title: 'Vocal warm-up', minutes: 10 },
                      { title: 'Song practice', minutes: 15 },
                    ] } },
  ],
  milestones: [],
  suggestedAvailableDaysPerWeek: 6, suggestedWorkload: 'moderate',
}
```

`defaultTarget.aggregate: 'count'` targets **practice days** (§2 "6 days/week"); a user who instead cares about total minutes flips the same activity's target to `aggregate: 'sum', amount: 150` in Plan Review — one dropdown, no new activity.

### 2.3 Skill — an instrument with milestones (Piano, §2)

```ts
pianoBeginner: {
  id: 'pianoBeginner', label: 'Learn piano', appliesToType: 'skill',
  activities: [
    { name: 'Practice session', kind: 'session', role: 'input', unit: null, decimals: 0,
      defaultTarget: { aggregate: 'count', amount: 3, band: { min: 2, max: 4 }, compare: null },
      scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [2, 4, 6],
                    defaultMinutes: 25, stepTemplate: [] } },
  ],
  milestones: [
    { title: 'Posture & hand position', atFraction: 0.05 },
    { title: 'Basic chords',            atFraction: 0.20 },
    { title: 'Major scales',            atFraction: 0.45 },
    { title: 'First song',              atFraction: 0.70 },
    { title: 'Second song',             atFraction: 1.00 },
  ],
  suggestedAvailableDaysPerWeek: 3, suggestedWorkload: 'light',
}
```

`atFraction` is resolved against `[startDate, resolveDeadline(deadline)]` by `spreadMilestones` (§3 below). A goal with no deadline (an open-ended skill goal) instead spaces milestones by a default cadence (every 4 weeks) starting from `startDate` — there is no fraction of infinity to compute.

### 2.4 Project — multi-stage build

```ts
genericProject: {
  id: 'genericProject', label: 'Build something', appliesToType: 'project',
  activities: [
    { name: 'Work session', kind: 'session', role: 'input', unit: null, decimals: 0,
      defaultTarget: { aggregate: 'count', amount: 3, band: null, compare: null },
      scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [1, 3, 5],
                    defaultMinutes: 60, stepTemplate: [] } },
  ],
  milestones: [
    { title: 'Milestone 1', atFraction: 0.33 },
    { title: 'Milestone 2', atFraction: 0.66 },
    { title: 'Milestone 3', atFraction: 1.00 },
  ],
  suggestedAvailableDaysPerWeek: 3, suggestedWorkload: 'moderate',
}
```

Project milestones are placeholders the user renames immediately in Plan Review (§4's "the user must be able to edit the generated plan" is doing real work here) — the template's only job is to prove the goal has *a* shape, not to guess the user's actual project stages.

### 2.5 Generic fallbacks

`genericHabit` (one `habit`-kind input activity, `aggregate: 'count'`, no milestones) and `genericSkill` (one `session` activity, three evenly-spaced placeholder milestones) exist so every `GoalType` has at least one always-available preset, plus "Custom" (empty activity list) for anything the four templates above don't fit — the architecture is generic per §2's closing requirement ("future goals such as learning programming, reading, personal projects, running, savings").

### 2.6 Adding a template later

Push one object into `GOAL_TEMPLATES`. No type, store, index, or migration changes — templates are pure UI-time data, never persisted (only their *output*, an ordinary `Activity`/`Milestone`, is saved). This is the same "no migration" property DATA-MODEL.md §1.6 designed for tracking kinds, for the same reason.

---

## 3. Milestone scaffolding — `spreadMilestones`

```ts
// src/domain/planner/milestones.ts
export function spreadMilestones(
  drafts: MilestoneDraft[],
  startDate: LocalDate,
  deadline: LocalDate | null,   // already resolved via resolveDeadline()
): Array<{ title: string; description?: string; targetDate: LocalDate | null; order: number }>
```

- With a `deadline`: `targetDate = clampDate(addDays(startDate, round(atFraction * diffDays(startDate, deadline))), startDate, deadline)`.
- Without one (open-ended habit/skill goal): `targetDate = addDays(startDate, order * 28)` — a flat 4-week cadence, clearly a placeholder rhythm rather than a claim about difficulty.
- `order` is assigned by array position, dense `0..n-1`, matching DATA-MODEL.md's `Milestone.order`.
- Every produced date is re-validated by the same `validateMilestone` clamp EDGE-CASES.md EC-P09 already specifies (`goal.startDate <= targetDate <= deadline`) — `spreadMilestones` and manual entry share one guard, so a hand-typed date can't violate what a generated one cannot.

"Current milestone" (§8/§9) is then simply `milestones.find(m => m.status !== 'done') ?? milestones.at(-1)` — no separate concept needed.

---

## 4. Feasibility and weekly totals

Fully specified in **[EDGE-CASES.md §F](EDGE-CASES.md)**: `FeasibilityCode`, `PlanSpec`, `buildPlanSpec`, `weekTargetsFor`, the division-by-zero guards (EC-P01–P06), integer-minor-unit allocation (`allocateLargestRemainder`, EC-P07), and the "never a bare point-prediction" rule for metric bands (EC-P08). This document adds only how `PlanSpec.totalQuantity`/`perWeekBand` are **populated from Activities** rather than left abstract:

```ts
// src/domain/planner/spec.ts (extends EDGE-CASES.md §F's buildPlanSpec)
export function totalQuantityFor(activity: Activity, weeks: number): number {
  if (!activity.defaultTarget) return 0;
  return activity.defaultTarget.amount * weeks;     // a per-week target scaled across the horizon
}
```

For the **outcome** activity of a metric goal specifically, `totalQuantity` is not used at all — metric goals do not get a weekly quota (Decisions §0). Instead `buildPlanSpec` computes the goal-level `perWeekBand` directly from `(targetValue - startValue) / weeks`, feeding DATA-MODEL.md §3.2's **outcome band** formula, and every *other* activity on that goal (the input habits) goes through `totalQuantityFor` normally. This is the concrete rule that keeps "43 → 50 kg" off the weekly checklist while "3 workouts" stays on it.

**First/last partial week proration** (EDGE-CASES.md EC-T08/EC-T09) is unchanged and reused verbatim; it is what makes a goal created on a Saturday not read as "already behind" on day one.

---

## 5. Daily task generation

```ts
// src/domain/planner/tasks.ts
export function generateTasksForWeek(
  activities: Activity[],
  plan: WeeklyPlan,
  weekDays: readonly [LocalDate, LocalDate, LocalDate, LocalDate, LocalDate, LocalDate, LocalDate],
): DailyTaskDraft[]
```

For each `WeeklyTarget` in `plan.targets`, look up its `Activity.scheduling`:

- **`daysPerWeek`** — place `min(daysPerWeek, target.amount)` tasks on the activity's `preferredDays` (weekday indices, Monday-first), taking the earliest N days that intersect the current week's actual day list (so a partial first/last week naturally gets fewer task slots without extra logic — the proration already shrank `target.amount`, and this step just can't place more slots than there are matching preferred days). Ties (more preferred days than needed) drop from the end of the list, keeping tasks spread rather than clustered.
- **`fixedDays`** — one task on each listed weekday, every week, regardless of target amount (used for things like "always Tuesday and Thursday", independent of how many the target says — a mismatch here is a legitimate signal surfaced in Plan Review, not silently resolved).
- **`none`** — no tasks are generated; the activity is logged directly from its own quick-log sheet (e.g. an ad-hoc weigh-in), matching DATA-MODEL.md §1.2's Fitness example where the "Weight" activity has `scheduling.mode: 'none'`.

Each placed task's `title`/`plannedMinutes`/`steps` come from the activity's `name`/`scheduling.defaultMinutes`/`scheduling.stepTemplate` (DATA-MODEL.md `TaskStep[]`, embedded). A milestone-linked activity (rare — most milestones are checkpoints, not daily work) additionally sets `milestoneId`.

This function is called by `ensureMaterialized` (EDGE-CASES.md §F, `materialize.ts`) every time a week is (re)materialized — task generation is not a separate scheduled job, it is a deterministic projection of that week's `targets`, which is why editing a week's target and re-materializing only ever touches `pending` tasks (EC-K08) and never fabricates a duplicate (idempotent upsert keyed by `(goalId, activityId, date)` within the week, checked before insert).

---

## 6. On track / Behind / Ahead

Adopted verbatim from **[EDGE-CASES.md §D.1](EDGE-CASES.md)** (`weekBand`, time-prorated against *elapsed* slots, not the whole week — the fix for "every user reads Behind on Monday morning"). Thresholds: `ratio ≥ 1.15` → Ahead, `≥ 0.85` → On track, else Behind; `elapsedSlots === 0` → "—" (no-data), never "Behind". Reused as-is for the Goal Detail (§9) and Today (§7) badges; no second implementation exists.

---

## 7. Re-planning

Adopted verbatim from **[EDGE-CASES.md §B.2](EDGE-CASES.md)**: the merge rule (frozen past / kept user-edited / replaced elastic / deleted-or-orphaned beyond a shortened deadline), the remaining-work pool formula, `allocateLargestRemainder`, and the current-week floor (`target_cw = max(allocated_cw, doneByWeek[cw])`, EC-L03). The Deadline-change preview sheet shown there is this engine's confirmation UI — nothing here adds a second re-plan algorithm; `planReplan`/`applyReplan` are the one implementation, exercised by both a deadline edit (§5.2's trigger) and an explicit "Adjust future weeks" tap on a behind week (§5's headline scenario, "1 of 3 planned workouts" → **Keep original plan** / **Adjust future weeks**).

One addition: **pace-band re-check on re-plan.** After redistribution, if a metric goal's new `perWeekBand` exceeds `MetricGoalConfig.paceBand` (DATA-MODEL.md), the preview sheet surfaces it exactly as EDGE-CASES.md's mock shows — *"⚠ Above the 0.35 kg/wk range you set."* — a warning, never a block; the user can still Apply.

---

## 8. Worked examples

### 8.1 Fitness — 43 → 50 kg by March 2027

Fully worked in **[DATA-MODEL.md §7](DATA-MODEL.md)**, including the on-disk records. Summary of the numbers: `resolveDeadline` → `2027-03-31`; `weeksBetween('2026-09-14','2027-03-31') = 28`; `weeklyDelta = (50-43)/28 = 0.25 kg/wk`; outcome band half-width at week 10, `k=2`: `2 × √10 × 0.25 ≈ 1.58 kg` → the app would show a band, not a point, for any week that far out (the spec's own longer 78-week framing to March **2027** from a **2026** start is deliberately used here at the shorter, denominator-correct span — see the note in DATA-MODEL.md §7 for the exact figure used there). Supporting habits from the `weightChange` template: Workout 3×/week (band 2–4), Weight log 3×/week.

### 8.2 Singing — daily/weekly practice, no fixed deadline

Goal: `type: 'habit'`, `startDate: '2026-09-19'`, `deadline: null` (habit goals may be open-ended, DATA-MODEL.md `HabitGoalConfig.horizon: 'ongoing'`). Template: `singingPractice`.

```
buildPlanSpec: no deadline ⇒ no weeksRemaining division at all (EC-P01's guard doesn't
even apply — an ongoing habit goal's PlanSpec is generated one week at a time, always
at the flat target, forever, until paused/archived).

Week target: Practice — 6 days, 30 min each (5 breathing / 10 warm-up / 15 song).
Task placement: preferredDays [1,2,3,4,5,6] (Mon–Sat) → 6 tasks this week, Sunday free.

Today (Sat 2026-09-19), mid-week: 5 of 6 practice days logged so far this week.
weekBand(doneSoFar=5, elapsedSlots=6, weekTarget=6) → ratio 0.83 → 'behind' by a hair;
if today were Sunday with 6/6 done, ratio 1.0 → 'on-track'.
```

This demonstrates the count-vs-sum aggregate switch (§4/§2.2): a user who cares about total minutes instead flips this same activity's target to `{ aggregate: 'sum', amount: 150 }` with no other change.

### 8.3 Piano — beginner, 5 songs, with milestones

Goal: `type: 'skill'`, `startDate: '2026-09-19'`, `deadline: { precision: 'month', value: '2027-06' }` → `resolveDeadline = '2027-06-30'` → `diffDays = 284` days ≈ 40.6 weeks. Template: `pianoBeginner`.

```
spreadMilestones (5 drafts, atFraction 0.05/0.20/0.45/0.70/1.00) over 284 days:
  Posture & hand position   → +14 days  → 2026-10-03
  Basic chords              → +57 days  → 2026-11-15
  Major scales              → +128 days → 2027-01-25
  First song                → +199 days → 2027-04-06
  Second song               → +284 days → 2027-06-30

Practice session: 3×/week (band 2–4), 25 min, Tue/Thu/Sat.
Week 1 (goal created Sat 2026-09-19, mid-week): prorated per EC-T08 —
  available slots this week from [Tue,Thu,Sat] ∩ [remaining days] = 1 (Sat only)
  target₀ = round(3 × 1/3) = 1 session this week.
Goal Detail (§9): "Current milestone: Posture & hand position" until 2026-10-03 passes
  or the user marks it done, then it advances to "Basic chords" automatically
  (current milestone = first non-done, §3 above).
```

---

## 9. Materialization windows

Adopted verbatim from EDGE-CASES.md §F: `MAX_MATERIALIZED_WEEKS = 8` (rolling from the current week), `MAX_MATERIALIZED_TASK_DAYS = 14` (from today), `MAX_PLAN_WEEKS = 520` (~10-year hard cap on a plan horizon, `HORIZON_TOO_LONG` beyond it). Weeks outside the materialized window render from `PlanSpec` directly (`weekTargetsFor`) with no row written until the window reaches them or the user edits one.

---

## 10. Test matrix

Owned by **[EDGE-CASES.md §K](EDGE-CASES.md)** (`src/domain/planner/*.test.ts`). This document adds three cases specific to the templates/scaffolding layer added here:

| Case | Expect |
|---|---|
| `instantiateTemplate(weightChange, {startDate, deadline})` | 2 activities, roles `outcome`+`input`, exactly one `role:'outcome'` (matches DATA-MODEL.md's OUTCOME_CARDINALITY invariant) |
| `spreadMilestones` with no deadline (habit goal) | dates spaced exactly 28 days apart from `startDate`, never `null` |
| `spreadMilestones` with `atFraction: 1.00` | `targetDate === resolveDeadline(deadline)` exactly, not one day off from rounding |
| `generateTasksForWeek`, `daysPerWeek: 3` on a week prorated to `target.amount: 1` | exactly 1 task generated, on the earliest matching preferred day |
| `totalQuantityFor` on the outcome activity of a metric goal | never called — metric goals compute `perWeekBand`, not `totalQuantity`, for their outcome stream (assert the planner never divides by the outcome activity's target) |
