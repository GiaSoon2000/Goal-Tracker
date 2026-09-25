/**
 * Composite, multi-table READ queries that don't belong to one single entity's
 * repo file. Still repo/-only — the one place allowed to call getDb() directly.
 */
import { getDb } from '../db/database';
import { endOfWeek, startOfWeek, todayLocal } from '../domain/date';
import { goalProgress, summarizeWeek } from '../domain/progress';
import { latestEntry } from './entryRepo';
import type { Activity, DailyTask, Goal, GoalProgress, LocalDate, WeekSummary, WeeklyPlan } from '../domain/types';

export interface TodayScreenData {
  goals: Goal[];
  summaries: WeekSummary[];
  tasks: DailyTask[];
}

export async function todayScreenQuery(today: LocalDate, weekStartsOn: 0 | 1): Promise<TodayScreenData> {
  const db = getDb();
  const goals = await db.goals.where('status').equals('active').sortBy('sortOrder');
  const weekStart = startOfWeek(today, weekStartsOn);
  const weekEnd = endOfWeek(today, weekStartsOn);

  const summaries: WeekSummary[] = [];
  for (const goal of goals) {
    const activities = await db.activities.where('goalId').equals(goal.id).toArray();
    const plan = (await db.weeklyPlans.where('[goalId+weekStart]').equals([goal.id, weekStart]).first()) ?? null;
    const entries = await db.entries.where('[goalId+date]').between([goal.id, weekStart], [goal.id, weekEnd], true, true).toArray();
    summaries.push(summarizeWeek({ goal, activities, plan, entries, weekStart, today, weekStartsOn }));
  }

  const tasks = await db.tasks.where('date').equals(today).sortBy('sortOrder');
  return { goals, summaries, tasks };
}

export interface GoalsScreenRow {
  goal: Goal;
  progress: GoalProgress;
}

export async function goalsScreenQuery(): Promise<GoalsScreenRow[]> {
  const db = getDb();
  const today = todayLocal();
  const goals = await db.goals.where('status').equals('active').sortBy('sortOrder');
  const rows: GoalsScreenRow[] = [];
  for (const goal of goals) {
    const activities = await db.activities.where('goalId').equals(goal.id).toArray();
    const milestones = await db.milestones.where('goalId').equals(goal.id).toArray();
    const outcome = activities.find((a) => a.role === 'outcome');
    const latestOutcomeEntry = outcome ? await latestEntry(outcome.id) : null;
    rows.push({ goal, progress: goalProgress({ goal, activities, milestones, latestOutcomeEntry, today }) });
  }
  return rows;
}

export interface GoalDetailData {
  goal: Goal | null;
  activities: Awaited<ReturnType<typeof activitiesFor>>;
  milestones: Awaited<ReturnType<typeof milestonesFor>>;
  progress: GoalProgress | null;
  weekSummary: WeekSummary | null;
}

async function activitiesFor(db: ReturnType<typeof getDb>, goalId: Goal['id']) {
  return db.activities.where('goalId').equals(goalId).sortBy('sortOrder');
}
async function milestonesFor(db: ReturnType<typeof getDb>, goalId: Goal['id']) {
  return db.milestones.where('goalId').equals(goalId).sortBy('order');
}

export async function goalDetailQuery(goalId: Goal['id'], today: LocalDate, weekStartsOn: 0 | 1): Promise<GoalDetailData> {
  const db = getDb();
  const goal = (await db.goals.get(goalId)) ?? null;
  if (!goal) return { goal: null, activities: [], milestones: [], progress: null, weekSummary: null };

  const activities = await activitiesFor(db, goalId);
  const milestones = await milestonesFor(db, goalId);
  const outcome = activities.find((a) => a.role === 'outcome');
  const latestOutcomeEntry = outcome ? await latestEntry(outcome.id) : null;
  const progress = goalProgress({ goal, activities, milestones, latestOutcomeEntry, today });

  const weekStart = startOfWeek(today, weekStartsOn);
  const weekEnd = endOfWeek(today, weekStartsOn);
  const plan = (await db.weeklyPlans.where('[goalId+weekStart]').equals([goalId, weekStart]).first()) ?? null;
  const entries = await db.entries.where('[goalId+date]').between([goalId, weekStart], [goalId, weekEnd], true, true).toArray();
  const weekSummary = summarizeWeek({ goal, activities, plan, entries, weekStart, today, weekStartsOn });

  return { goal, activities, milestones, progress, weekSummary };
}

export interface WeekDetailRow {
  goal: Goal;
  plan: WeeklyPlan;
  activities: Activity[];
}

/** Every active goal's plan for one specific week — spec §10's Week Detail screen. */
export async function weekDetailQuery(weekStart: LocalDate): Promise<WeekDetailRow[]> {
  const db = getDb();
  const plans = await db.weeklyPlans.where('weekStart').equals(weekStart).toArray();
  const rows: WeekDetailRow[] = [];
  for (const plan of plans) {
    const goal = await db.goals.get(plan.goalId);
    if (!goal || goal.status !== 'active') continue;
    const activities = await db.activities.where('goalId').equals(plan.goalId).toArray();
    rows.push({ goal, plan, activities });
  }
  return rows;
}
