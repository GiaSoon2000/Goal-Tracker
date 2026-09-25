/**
 * Single source of truth for every persisted shape. No imports, no runtime code
 * except `newId`/typed helpers — usable from Node tests with no DB at all.
 * See docs/DATA-MODEL.md for the full design rationale.
 */

/* ────────────────────────── branded primitives ────────────────────────── */

declare const brandKey: unique symbol;
type Brand<T, B extends string> = T & { readonly [brandKey]: B };

/** Calendar day in the user's local timezone: 'YYYY-MM-DD'. Sorts chronologically. */
export type LocalDate = Brand<string, 'LocalDate'>;
/** The week's first day, per Settings.weekStartsOn. Always a LocalDate. */
export type WeekKey = LocalDate;
/** Epoch milliseconds, UTC. Plain number so arithmetic stays ergonomic. */
export type Millis = number;

export type GoalId = Brand<string, 'GoalId'>;
export type ActivityId = Brand<string, 'ActivityId'>;
export type MilestoneId = Brand<string, 'MilestoneId'>;
export type WeeklyPlanId = Brand<string, 'WeeklyPlanId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type EntryId = Brand<string, 'EntryId'>;
export type StepId = Brand<string, 'StepId'>;

export interface Entity {
  createdAt: Millis;
  updatedAt: Millis;
}

/* ───────────────────────────── settings ───────────────────────────── */

export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday
export type ThemePref = 'system' | 'light' | 'dark';

export type CanonicalUnit = 'kg' | 'km' | 'min' | 'count';
export type DisplayUnit = 'kg' | 'lb' | 'km' | 'mi' | 'min' | 'h' | 'count';

export interface Settings extends Entity {
  id: 'singleton';
  weekStartsOn: WeekStart;
  /** 0..6. "Today" ends N hours after midnight. Default 0. */
  dayRolloverHour: number;
  theme: ThemePref;
  /**
   * Live display unit for every metric/duration activity's chart and readout
   * (a pure read-time formatting choice — see formatEntry in units.ts) AND the
   * default offered when creating a new activity. Changing this writes zero rows.
   */
  displayUnits: { weight: DisplayUnit; distance: DisplayUnit; duration: DisplayUnit; currency: string };
  lastBackupAt: Millis | null;
  /** Days between backup nudges; 0 disables. Default 14. */
  backupReminderDays: number;
  onboardedAt: Millis | null;
  schemaVersion: number;
}

/* ────────────────────────────── goals ────────────────────────────── */

export type GoalStatus = 'active' | 'paused' | 'archived' | 'completed';
export type GoalColor = 'slate' | 'blue' | 'teal' | 'green' | 'amber' | 'rose' | 'violet';

/**
 * §2 specifies "Deadline: March 2027" — month precision, not a fabricated day.
 * Month precision resolves to the LAST day of that month everywhere math needs
 * a concrete date (see resolveDeadline in date.ts).
 */
export type Deadline = { precision: 'month'; value: string } | { precision: 'day'; value: LocalDate };

/** A closed-or-open pause window. `to: null` means "still paused". Inclusive both ends. */
export interface PauseInterval {
  from: LocalDate;
  to: LocalDate | null;
}

export interface GoalBase extends Entity {
  id: GoalId;
  name: string;
  description?: string;
  status: GoalStatus;
  startDate: LocalDate;
  /** null only for open-ended habit goals; every other type requires one. */
  deadline: Deadline | null;
  pauses: PauseInterval[];
  /** Manual ordering on the Goals screen. Sparse: 0, 100, 200 … */
  sortOrder: number;
  color: GoalColor;
  icon?: string;
  completedAt: Millis | null;
  archivedAt: Millis | null;
}

export interface MetricGoalConfig {
  direction: 'increase' | 'decrease';
  startValue: number;
  targetValue: number;
  /** Free text display label ('kg', 'km', 'USD'), decoupled from the outcome
   *  activity's strict CanonicalUnit storage. */
  unit: string;
  decimals: 0 | 1 | 2;
  /** Realistic target range: safe pace bounds in unit/week. Planner clamps to this. */
  paceBand: { minPerWeek: number; maxPerWeek: number } | null;
}

export interface HabitGoalConfig {
  horizon: 'ongoing' | 'until-deadline';
}

export interface SkillGoalConfig {
  currentLevel: string;
  targetOutcome: string;
  levelScale: string[] | null;
}

export interface ProjectGoalConfig {
  milestoneWeighting: 'equal' | 'manual';
}

export type Goal =
  | (GoalBase & { type: 'metric'; config: MetricGoalConfig })
  | (GoalBase & { type: 'habit'; config: HabitGoalConfig })
  | (GoalBase & { type: 'skill'; config: SkillGoalConfig })
  | (GoalBase & { type: 'project'; config: ProjectGoalConfig });

export type GoalType = Goal['type'];
export type GoalOf<T extends GoalType> = Extract<Goal, { type: T }>;

/* ──────────────────────────── activities ──────────────────────────── */

export type TrackKind = 'metric' | 'habit' | 'duration' | 'session';
/** 'outcome' = the result being moved (weight). 'input' = the work that moves it (workouts). */
export type ActivityRole = 'outcome' | 'input';
export type TargetAggregate = 'count' | 'sum' | 'latest' | 'mean';

export interface ActivityTarget {
  aggregate: TargetAggregate;
  amount: number;
  band: { min: number; max: number } | null;
  compare: 'gte' | 'lte' | null;
}

export interface StepTemplate {
  title: string;
  minutes: number | null;
}

export type ActivityScheduling =
  | { mode: 'daysPerWeek'; daysPerWeek: number; preferredDays: number[]; defaultMinutes: number | null; stepTemplate: StepTemplate[] }
  | { mode: 'fixedDays'; days: number[]; defaultMinutes: number | null; stepTemplate: StepTemplate[] }
  | { mode: 'none' };

export interface Activity extends Entity {
  id: ActivityId;
  goalId: GoalId;
  name: string;
  kind: TrackKind;
  role: ActivityRole;
  /** Canonical unit for metric/duration activities; null for habit/session. Fixed at creation. */
  unit: CanonicalUnit | null;
  decimals: 0 | 1 | 2;
  defaultTarget: ActivityTarget | null;
  scheduling: ActivityScheduling;
  color: GoalColor | null;
  sortOrder: number;
  /** Hide from entry UI without destroying history. NOT indexed (booleans aren't IDB keys). */
  archived: boolean;
}

/* ──────────────────────────── milestones ──────────────────────────── */

export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export interface Milestone extends Entity {
  id: MilestoneId;
  goalId: GoalId;
  title: string;
  description?: string;
  targetDate: LocalDate | null;
  status: MilestoneStatus;
  completedAt: Millis | null;
  order: number;
  weight: number;
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
  weekStart: WeekKey;
  weekStartsOn: WeekStart;
  targets: WeeklyTarget[];
  /** Metric goals only: suggested value range at week end. null otherwise. */
  outcomeBand: { min: number; max: number } | null;
  source: 'generated' | 'edited' | 'replanned';
  tasksGeneratedAt: Millis | null;
  note?: string;
  /** No `actuals` field — actuals are always derived from `entries` (see progress.ts). */
}

/* ──────────────────────────── daily tasks ──────────────────────────── */

export type TaskStatus = 'pending' | 'done' | 'skipped';

export interface TaskStep {
  id: StepId;
  title: string;
  minutes: number | null;
  done: boolean;
}

export interface DailyTask extends Entity {
  id: TaskId;
  goalId: GoalId;
  activityId: ActivityId | null;
  milestoneId: MilestoneId | null;
  date: LocalDate;
  title: string;
  plannedMinutes: number | null;
  status: TaskStatus;
  completedAt: Millis | null;
  steps: TaskStep[];
  source: 'generated' | 'user';
  originalDate: LocalDate | null;
  entryId: EntryId | null;
  sortOrder: number;
}

/* ─────────────────────────── track entries ─────────────────────────── */

export interface TrackEntryBase extends Entity {
  id: EntryId;
  goalId: GoalId;
  activityId: ActivityId;
  date: LocalDate;
  loggedAt: Millis;
  note?: string;
  taskId: TaskId | null;
  source: 'manual' | 'task' | 'import';
}

/**
 * `metric`/`duration` store BOTH the canonical number (always in the activity's
 * fixed CanonicalUnit) AND the verbatim entry the user typed (entryValue/entryUnit).
 * Switching the display unit is then a pure read-time formatting choice and NEVER
 * rewrites a stored value — the fix for the classic kg<->lb corruption trap.
 */
export type TrackEntry =
  | (TrackEntryBase & { kind: 'metric'; value: { n: number; entryValue: number; entryUnit: DisplayUnit } })
  | (TrackEntryBase & { kind: 'habit'; value: { done: true } })
  | (TrackEntryBase & { kind: 'duration'; value: { minutes: number; entryValue: number; entryUnit: DisplayUnit } })
  | (TrackEntryBase & { kind: 'session'; value: { count: number; minutes: number | null; intensity: 1 | 2 | 3 | null } });

export type TrackValue = TrackEntry['value'];
export type TrackEntryOf<K extends TrackKind> = Extract<TrackEntry, { kind: K }>;

/* ──────────────────────────────── meta / trash ──────────────────────────────── */

export type MetaRecord =
  | { key: 'schema'; schemaVersion: number; dbVersion: number; installedAt: Millis }
  | { key: 'lastImport'; at: Millis; mode: 'replace' | 'merge'; counts: Record<string, number> };

export type MetaKey = MetaRecord['key'];

export interface GoalSubtree {
  goal: Goal;
  activities: Activity[];
  milestones: Milestone[];
  weeklyPlans: WeeklyPlan[];
  tasks: DailyTask[];
  entries: TrackEntry[];
}

/** A 30-day recoverable-delete record. One row per deleted goal. */
export interface TrashEntry {
  id: string;
  goalName: string;
  deletedAt: Millis;
  expiresAt: Millis;
  payload: GoalSubtree;
}

/* ─────────────────────────── export document ─────────────────────────── */

export interface ExportDoc {
  format: 'goal-backward-planner';
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  counts: Record<Exclude<StoreName, 'meta' | 'trash'>, number>;
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

export type StoreName = 'settings' | 'goals' | 'activities' | 'milestones' | 'weeklyPlans' | 'tasks' | 'entries' | 'meta' | 'trash';

/* ───────────────────── derived (never persisted) ───────────────────── */

export type TrackStatus = 'ahead' | 'on_track' | 'behind' | 'no_target';

export interface WeekActivityRow {
  activityId: ActivityId;
  name: string;
  kind: TrackKind;
  aggregate: TargetAggregate;
  unit: CanonicalUnit | null;
  target: number | null;
  band: { min: number; max: number } | null;
  actual: number;
  status: TrackStatus;
}

export interface WeekSummary {
  goalId: GoalId;
  weekStart: WeekKey;
  rows: WeekActivityRow[];
  /** Σ min(actual, target) / Σ target across targeted input rows; null when no targets. */
  adherence: number | null;
  status: TrackStatus;
}

export interface GoalProgress {
  goalId: GoalId;
  /** 0..1, or null when the goal type has no meaningful completion ratio. */
  ratio: number | null;
  currentValue: number | null;
  targetValue: number | null;
  unit: string | null;
  milestonesDone: number;
  milestonesTotal: number;
  daysRemaining: number | null;
  currentMilestone: Milestone | null;
}
