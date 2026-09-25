# Goal Backward Planner — Product Specification (canonical, from user)

## 1. Product Concept

Build a mobile-first personal goal planning and tracking app.

The core concept is:

**Goal → Deadline → Milestones → Weekly Targets → Daily Tasks → Tracking → Progress Visualization → Re-planning**

The app should help users take a long-term goal and work backward to determine what they should realistically do each week and each day.

This is NOT intended to be a generic todo-list app. The main value is **backward planning + progress tracking**.

## 2. Target Use Cases

### Fitness
- Current weight: 43 kg
- Target weight: 50 kg
- Deadline: March 2027
- Workout target: 3 sessions/week
- Weight tracking: several times/week

### Singing
- Goal: Improve singing ability
- Daily/weekly practice target
- Practice duration
- Specific practice tasks such as breathing, warm-up, pitch exercises and song practice

### Piano
- Current level: Beginner
- Goal: Learn to play several songs
- Deadline
- Milestones such as chords, scales and individual songs
- Weekly practice target
- Daily practice tasks

The architecture should be generic enough to support future goals such as learning programming, reading, personal projects, running, savings, etc.

## 3. Goal Types

Support four goal types:

### Metric Goal
For measurable values. Examples: Weight, Running distance, Money saved.
Fields: Current value, Target value, Unit, Deadline.

### Habit Goal
For recurring actions. Examples: Workout 3 times/week, Practice singing 6 days/week.
Fields: Frequency, Target per week, Optional duration.

### Skill Goal
For learning or improving a skill. Examples: Singing, Piano, Programming.
Fields: Current level, Target outcome, Milestones, Deadline.

### Project Goal
For multi-stage projects. Examples: Build an application, Complete a software project.
Fields: Milestones, Tasks, Deadline.

## 4. Backward Planning Engine

This is the core feature.

When creating a goal, the user provides: Goal name, Goal type, Current status/value, Target status/value, Deadline, Optional milestones, Available days per week, Preferred workload.

The system calculates a suggested plan:

Goal → Milestones → Monthly targets → Weekly targets → Daily tasks

The generated plan should be treated as a **suggestion**, not an absolute requirement. The user must be able to edit the generated plan.

Example: Goal 43 kg → 50 kg, Deadline March 2027.
Suggested weekly: Workout 3 sessions; Weight tracking 3 times; Nutrition tracking optional.

The system should avoid presenting uncertain real-world progress as exact predictions. Use realistic target ranges where appropriate.

## 5. Re-planning

Users will sometimes miss planned tasks. The app should not simply mark the user as failed.

Example: Planned 3 workouts, Actual 1 workout. Show: "You completed 1 of 3 planned workouts."

Offer: Keep original plan; Adjust/re-plan future weeks.

Re-planning should redistribute remaining work across the remaining time where appropriate. The user must always have control over the new plan.

## 6. Main Navigation

Simple mobile-first bottom navigation: 1. Today  2. Goals  3. Plan  4. Progress  5. More.
Avoid excessive navigation complexity.

## 7. Today Screen

Default home screen. The user should immediately understand: What should I do today? How am I doing this week? What goals need attention?

Example:

```
Today

Fitness      2 / 3 workouts this week
Singing      5 / 7 practice days
Piano        2 / 3 practice sessions

Today's Tasks:
☐ Workout
☐ Singing practice — 30 min
☐ Piano — chords practice
```

Tasks should be easy to complete with one tap.

## 8. Goals Screen

Display all active goals.

```
Fitness   43 → 50 kg   Progress: 7%   Deadline: March 2027
Singing   Daily practice   Progress based on selected tracking metrics
Piano     5 songs   Current milestone: Basic chords
```

Users can: Create goal, Edit goal, Pause goal, Archive goal, Delete goal.

## 9. Goal Detail Screen

Show: Goal, Current value, Target value, Deadline, Overall progress, Current milestone, Weekly target, This week's actual progress, Upcoming milestones, Recent activity.

```
Fitness
43 kg → 50 kg
Current: 43.5 kg
Target: 50 kg

This week:
Workout      2 / 3
Weight logs  3 / 3

Weekly progress: On track / Behind / Ahead
```

## 10. Plan Screen

Show the user's plan organized by week.

```
September 2026

Week 1
✓ Fitness: 3 workouts
✓ Singing: 5 practices
✓ Piano: 2 practices

Week 2
✓ Fitness: 3 workouts
→ Singing: 6 practices
→ Piano: 3 practices

Current Week
Fitness: 3 workouts
Singing: 6 practices
Piano: 3 practices
```

Users can open a week and edit its targets.

## 11. Daily Tasks

Tasks should be simple and actionable.

```
Singing Practice — 30 min
☐ Breathing — 5 min
☐ Vocal warm-up — 10 min
☐ Song practice — 15 min
```

Allow: Completion, Skip, Edit, Reschedule.
Do not make task management overly complicated.

## 12. Tracking

Support simple tracking types, extensible for future types:

- **Metric** — Number, Unit, Date (e.g. Weight: 43.5 kg)
- **Habit** — Completed / not completed (e.g. Workout: completed)
- **Duration** — e.g. Singing practice: 30 minutes
- **Session** — e.g. Workout session #2

## 13. Progress Visualization

- Metric goals: line chart, current value, target value
- Habits: weekly completion, monthly consistency, calendar heatmap if appropriate
- Milestones: milestone progress, completed vs remaining
- Weekly planning: planned vs actual

Communicate progress quickly without overwhelming the user.

## 14. Local-First Architecture

The application should be completely free to operate. Do NOT require a backend for V1.

- Frontend: React / Next.js, TypeScript
- Storage: IndexedDB
- Application: Progressive Web App (PWA), mobile-first responsive design

No login for V1. No paid cloud database. No paid API.

## 15. Export / Import

Critical feature, because data is stored locally.

- **Export** all application data as JSON, e.g. `goal-planner-backup-2026-09-19.json`
- **Import**: allow users to select a JSON backup file and restore their data
- Before importing, clearly explain whether it will Replace or Merge existing data
- Prefer a safe import flow with confirmation
- Validate imported JSON before modifying existing data

## 16. Data Model

Design the data model around:

**User Settings**

**Goals** — id, name, type, description, currentValue, targetValue, unit, startDate, deadline, status

**Milestones** — id, goalId, title, description, targetDate, status

**Weekly Plans** — id, goalId, weekStart, targets, actuals

**Daily Tasks** — id, goalId, milestoneId, date, title, duration, completed, status

**Measurements** — id, goalId, date, type, value, unit

The model should support future extensions without requiring a major rewrite.

## 17. UI/UX Requirements

Mobile-first, responsive, clean, minimal, intuitive, mature, easy to understand, fast to use.

Design principles:
- Clear visual hierarchy
- Large touch targets
- Minimal unnecessary text
- One primary action per screen
- Avoid excessive cards
- Avoid unnecessary animations
- Avoid complicated forms
- Make progress visually obvious
- Make the next action obvious

The user should understand the current status and today's required actions within a few seconds of opening the app.

Avoid excessive gamification such as coins, XP, levels and complicated reward systems. A small amount of positive feedback is acceptable.

## 18. PWA Requirements

Work well on mobile browsers; support Add to Home Screen; work offline; load quickly; persist data locally; continue working without an internet connection. No network connection required for normal usage.

## 19. Privacy

All personal goal and tracking data remains on the user's device in V1. No analytics or external data collection. No account creation.

## 20. V1 Scope

**Must Have:** Create/edit/delete goals; four goal types; goal deadline; milestones; backward planning; weekly targets; daily tasks; task completion; metric tracking; habit tracking; weight tracking; progress charts; weekly planned vs actual; re-planning; local storage; IndexedDB; PWA; export JSON; import JSON; mobile-first UI.

**Nice to Have Later** (DO NOT implement in V1 unless required by architecture): cloud sync; user accounts; AI-generated plans; smart recommendations; calendar integration; notifications; Apple Health / Google Fit integration; cross-device synchronization.

## 21. Development Approach

Before writing the application code: analyze this specification; propose the architecture; define the data model; define the main user flows; define the component structure; identify edge cases; create the UI structure; then implement the application incrementally.

Do not immediately generate a large amount of code.

The architecture must support: goal creation, backward planning, weekly planning, daily tracking, progress visualization, re-planning, export/import.

Keep it simple enough for a single user; prioritize usability over feature quantity.

---

## Environment facts (for implementers)

- Working directory: `D:\Self Project\Goal Tracker` (empty at project start), Windows 11, PowerShell + Git Bash available
- Node v22.16.0, npm 10.9.2, git 2.45.1 — no pnpm
- Today's date used in examples: 2026-09-19
