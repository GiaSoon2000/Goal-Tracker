import { getDb } from '../db/database';
import { addDays, resolveDeadline, startOfWeek, weekDays } from '../domain/date';
import { aggregate } from '../domain/progress';
import { planReplan, type ReplanResult } from '../domain/planner/replan';
import { generateTasksForWeek } from '../domain/planner/tasks';
import { newId } from '../domain/ids';
import type { GoalId, LocalDate, TaskId, WeekStart, WeeklyPlan, WeeklyPlanId } from '../domain/types';

/** Pure-data preview: what re-planning WOULD do, without writing anything. */
export async function previewReplan(goalId: GoalId, today: LocalDate, weekStartsOn: WeekStart): Promise<ReplanResult> {
  const db = getDb();
  const goal = await db.goals.get(goalId);
  if (!goal) throw new Error(`Goal not found: ${goalId}`);
  const activities = await db.activities.where('goalId').equals(goalId).toArray();
  const existingPlans = await db.weeklyPlans.where('goalId').equals(goalId).toArray();

  const cw = startOfWeek(today, weekStartsOn);
  const doneBeforeCurrentWeek: Record<string, number> = {};
  const doneThisWeek: Record<string, number> = {};

  for (const activity of activities) {
    if (activity.role !== 'input' || !activity.defaultTarget) continue;
    const beforeEntries = await db.entries.where('[activityId+date]').between([activity.id, goal.startDate], [activity.id, addDays(cw, -1)], true, true).toArray();
    const thisWeekEntries = await db.entries.where('[activityId+date]').between([activity.id, cw], [activity.id, addDays(cw, 6)], true, true).toArray();
    doneBeforeCurrentWeek[activity.id] = aggregate(beforeEntries, activity.defaultTarget.aggregate);
    doneThisWeek[activity.id] = aggregate(thisWeekEntries, activity.defaultTarget.aggregate);
  }

  return planReplan({ goal, activities, existingPlans, today, weekStartsOn, doneBeforeCurrentWeek, doneThisWeek });
}

/** Applies a previously computed diff in one transaction. The user has already seen and approved it. */
export async function applyReplan(goalId: GoalId, diff: ReplanResult, weekStartsOn: WeekStart): Promise<void> {
  const db = getDb();
  const goal = await db.goals.get(goalId);
  if (!goal) throw new Error(`Goal not found: ${goalId}`);
  const activities = await db.activities.where('goalId').equals(goalId).toArray();
  const now = Date.now();

  await db.transaction('rw', [db.weeklyPlans, db.tasks], async () => {
    for (const week of diff.weeks) {
      if (week.kind === 'frozen' || week.kind === 'kept' || week.kind === 'orphaned') continue;

      if (week.kind === 'deleted') {
        if (week.planId) {
          await db.weeklyPlans.delete(week.planId);
          await db.tasks.where('[goalId+date]').between([goalId, week.weekStart], [goalId, addDays(week.weekStart, 6)], true, true).filter((t) => t.status === 'pending').delete();
        }
        continue;
      }

      // 'replaced' or 'created'
      const planRecord: WeeklyPlan = {
        id: week.planId ?? newId<WeeklyPlanId>(),
        goalId,
        weekStart: week.weekStart,
        weekStartsOn,
        targets: week.targets,
        outcomeBand: null,
        source: 'replanned',
        tasksGeneratedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await db.weeklyPlans.put(planRecord);

      // Regenerate ONLY this week's pending tasks (EC-K08) — done/skipped rows survive untouched.
      await db.tasks.where('[goalId+date]').between([goalId, week.weekStart], [goalId, addDays(week.weekStart, 6)], true, true).filter((t) => t.status === 'pending').delete();
      const deadlineDate = goal.deadline ? resolveDeadline(goal.deadline) : null;
      const drafts = generateTasksForWeek(activities, planRecord, weekDays(week.weekStart), { from: goal.startDate, to: deadlineDate });
      const tasks = drafts.map((d) => ({
        id: newId<TaskId>(),
        goalId: d.goalId,
        activityId: d.activityId,
        milestoneId: d.milestoneId,
        date: d.date,
        title: d.title,
        plannedMinutes: d.plannedMinutes,
        status: 'pending' as const,
        completedAt: null,
        steps: d.steps,
        source: 'generated' as const,
        originalDate: null,
        entryId: null,
        sortOrder: d.sortOrder,
        createdAt: now,
        updatedAt: now,
      }));
      if (tasks.length) await db.tasks.bulkAdd(tasks);
    }
  });
}
