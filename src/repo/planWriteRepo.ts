import { getDb } from '../db/database';
import { resolveDeadline, startOfWeek, weekDays } from '../domain/date';
import { newId } from '../domain/ids';
import { spreadMilestones } from '../domain/planner/milestones';
import type { ActivityDraft, MilestoneDraft } from '../domain/planner/templates';
import { weekTargetsFor } from '../domain/planner/weekTargets';
import { generateTasksForWeek } from '../domain/planner/tasks';
import type { Activity, ActivityId, DailyTask, Deadline, Goal, GoalColor, GoalId, GoalType, LocalDate, Milestone, MilestoneId, TaskId, WeeklyPlan, WeeklyPlanId } from '../domain/types';

export interface NewGoalInput {
  name: string;
  type: GoalType;
  description?: string;
  startDate: LocalDate;
  deadline: Deadline | null;
  color: GoalColor;
  config: Goal['config'];
  activities: ActivityDraft[];
  milestones: MilestoneDraft[];
}

/**
 * The one transaction behind goal creation: goal + activities + milestones + the
 * first materialized week (targets + generated tasks), all-or-nothing. This is
 * what makes "the plan is always internally consistent" a structural property
 * rather than a code-review hope (ARCHITECTURE.md §2).
 */
export async function createGoalWithPlan(input: NewGoalInput, weekStartsOn: 0 | 1): Promise<GoalId> {
  const db = getDb();
  const now = Date.now();
  const goalId = newId<GoalId>();

  return db.transaction('rw', [db.goals, db.activities, db.milestones, db.weeklyPlans, db.tasks], async () => {
    const goal = {
      id: goalId,
      type: input.type,
      name: input.name,
      status: 'active',
      startDate: input.startDate,
      deadline: input.deadline,
      pauses: [],
      sortOrder: (await db.goals.count()) * 100,
      color: input.color,
      completedAt: null,
      archivedAt: null,
      config: input.config,
      createdAt: now,
      updatedAt: now,
      ...(input.description !== undefined ? { description: input.description } : {}),
    } as Goal;
    await db.goals.add(goal);

    const activities: Activity[] = input.activities.map((draft, i) => ({
      id: newId<ActivityId>(),
      goalId,
      name: draft.name,
      kind: draft.kind,
      role: draft.role,
      unit: draft.unit,
      decimals: draft.decimals,
      defaultTarget: draft.defaultTarget,
      scheduling: draft.scheduling,
      color: null,
      sortOrder: i * 100,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }));
    if (activities.length) await db.activities.bulkAdd(activities);

    const deadlineDate = input.deadline ? resolveDeadline(input.deadline) : null;
    const spread = spreadMilestones(input.milestones, input.startDate, deadlineDate);
    const milestones: Milestone[] = spread.map((m) => ({
      id: newId<MilestoneId>(),
      goalId,
      title: m.title,
      targetDate: m.targetDate,
      status: m.status,
      completedAt: null,
      order: m.order,
      weight: 1,
      targetValue: null,
      source: m.source,
      createdAt: now,
      updatedAt: now,
      ...(m.description !== undefined ? { description: m.description } : {}),
    }));
    if (milestones.length) await db.milestones.bulkAdd(milestones);

    // Materialize the CONTAINING week (not startDate itself, which may be mid-week)
    // so the goal is immediately visible on Today/Plan.
    const firstWeekStart = startOfWeek(input.startDate, weekStartsOn);
    await materializeWeekInTx(db, goalId, activities, firstWeekStart, weekStartsOn, input.startDate, deadlineDate, now);

    return goalId;
  });
}

/** Shared by createGoalWithPlan and ensureWeekMaterialized — must run inside an open transaction. */
async function materializeWeekInTx(
  db: ReturnType<typeof getDb>,
  goalId: GoalId,
  activities: Activity[],
  weekStart: LocalDate,
  weekStartsOn: 0 | 1,
  goalStartDate: LocalDate,
  goalDeadline: LocalDate | null,
  now: number,
): Promise<void> {
  const targets = weekTargetsFor(activities, weekStart, weekStartsOn, goalStartDate, goalDeadline);
  const plan: WeeklyPlan = {
    id: newId<WeeklyPlanId>(),
    goalId,
    weekStart,
    weekStartsOn,
    targets,
    outcomeBand: null,
    source: 'generated',
    tasksGeneratedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await db.weeklyPlans.add(plan);

  const drafts = generateTasksForWeek(activities, plan, weekDays(weekStart), { from: goalStartDate, to: goalDeadline });
  const tasks: DailyTask[] = drafts.map((d) => ({
    id: newId<TaskId>(),
    goalId: d.goalId,
    activityId: d.activityId,
    milestoneId: d.milestoneId,
    date: d.date,
    title: d.title,
    plannedMinutes: d.plannedMinutes,
    status: 'pending',
    completedAt: null,
    steps: d.steps,
    source: 'generated',
    originalDate: null,
    entryId: null,
    sortOrder: d.sortOrder,
    createdAt: now,
    updatedAt: now,
  }));
  if (tasks.length) await db.tasks.bulkAdd(tasks);
}

/**
 * Ensures a week is materialized for a goal (idempotent — a second call for the
 * same week is a no-op). Called at boot, on midnight rollover, and when the Plan
 * screen scrolls a new week into view.
 */
export async function ensureWeekMaterialized(goalId: GoalId, weekStart: LocalDate, weekStartsOn: 0 | 1): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.goals, db.activities, db.weeklyPlans, db.tasks], async () => {
    const existing = await db.weeklyPlans.where('[goalId+weekStart]').equals([goalId, weekStart]).first();
    if (existing) return;
    const goal = await db.goals.get(goalId);
    if (!goal || goal.status !== 'active') return;
    const activities = await db.activities.where('goalId').equals(goalId).toArray();
    const deadlineDate = goal.deadline ? resolveDeadline(goal.deadline) : null;
    await materializeWeekInTx(db, goalId, activities, weekStart, weekStartsOn, goal.startDate, deadlineDate, Date.now());
  });
}

/**
 * Ensures the CURRENT week exists for every active goal. This is what actually
 * makes materialization "lazy but continuous" as calendar weeks pass — without
 * it, a goal's tasks would only ever exist for the week it was created in.
 * Deliberately does NOT backfill every missed week in between (EDGE-CASES.md:
 * "no plan for this week" renders as no-data, never invented and marked missed).
 * Called at boot and whenever `today` changes (see MaterializationEffect).
 */
export async function ensureCurrentWeekMaterializedForActiveGoals(today: LocalDate, weekStartsOn: 0 | 1): Promise<void> {
  const db = getDb();
  const weekStart = startOfWeek(today, weekStartsOn);
  const activeGoals = await db.goals.where('status').equals('active').toArray();
  for (const goal of activeGoals) {
    await ensureWeekMaterialized(goal.id, weekStart, weekStartsOn);
  }
}
