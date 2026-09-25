import Dexie, { type EntityTable } from 'dexie';
import type { Activity, DailyTask, Goal, MetaRecord, Milestone, Settings, TrackEntry, TrashEntry, WeeklyPlan } from '../domain/types';

export const DB_NAME = 'goal-planner';
export const DB_VERSION = 1; // IndexedDB structural version
export const SCHEMA_VERSION = 1; // logical record-shape version (also written to exports)

export class GoalPlannerDb extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  activities!: EntityTable<Activity, 'id'>;
  milestones!: EntityTable<Milestone, 'id'>;
  weeklyPlans!: EntityTable<WeeklyPlan, 'id'>;
  tasks!: EntityTable<DailyTask, 'id'>;
  entries!: EntityTable<TrackEntry, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;
  trash!: EntityTable<TrashEntry, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(DB_VERSION).stores({
      settings: 'id',
      goals: 'id, status, [status+sortOrder], updatedAt',
      activities: 'id, goalId, [goalId+sortOrder]',
      milestones: 'id, goalId, [goalId+order]',
      weeklyPlans: 'id, goalId, weekStart, &[goalId+weekStart]',
      tasks: 'id, date, goalId, [date+sortOrder], [goalId+date]',
      entries: 'id, date, goalId, activityId, [activityId+date], [goalId+date], loggedAt',
      meta: 'key',
      trash: 'id, expiresAt, deletedAt',
    });
  }
}

/** Lazy singleton — never constructed outside a browser/secure context. */
let _db: GoalPlannerDb | null = null;
export function getDb(): GoalPlannerDb {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable in this environment');
  return (_db ??= new GoalPlannerDb());
}

/** Test-only: construct an isolated, uniquely-named DB instance (fake-indexeddb). */
export function createTestDb(name: string): GoalPlannerDb {
  return new GoalPlannerDb(name);
}
