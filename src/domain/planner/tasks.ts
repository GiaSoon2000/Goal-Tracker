import { dayOfWeek } from '../date';
import { newId } from '../ids';
import type { Activity, ActivityId, GoalId, LocalDate, MilestoneId, StepId, TaskStep, WeeklyPlan } from '../types';

export interface DailyTaskDraft {
  goalId: GoalId;
  activityId: ActivityId | null;
  milestoneId: MilestoneId | null;
  date: LocalDate;
  title: string;
  plannedMinutes: number | null;
  steps: TaskStep[];
  sortOrder: number;
}

/**
 * Generates the daily task slots for one already-materialized week, from its
 * targets and each activity's scheduling. Idempotent by construction: the caller
 * (materializeWeek in the repo layer) upserts by (goalId, activityId, date) so
 * calling this twice for the same week never creates a duplicate.
 *
 * `validRange` must be the SAME [goalStartDate, goalDeadline] window used to
 * prorate `plan.targets` (weekTargets.ts) — otherwise a prorated first/last week
 * can place its one slot on a day before the goal even started.
 */
export function generateTasksForWeek(activities: Activity[], plan: WeeklyPlan, weekDays: readonly LocalDate[], validRange: { from: LocalDate; to: LocalDate | null }): DailyTaskDraft[] {
  const drafts: DailyTaskDraft[] = [];
  let sortOrder = 0;
  const daysInRange = weekDays.filter((d) => d >= validRange.from && (!validRange.to || d <= validRange.to));

  for (const target of plan.targets) {
    const activity = activities.find((a) => a.id === target.activityId);
    if (!activity || activity.archived) continue;
    const { scheduling } = activity;

    if (scheduling.mode === 'none') continue;

    if (scheduling.mode === 'fixedDays') {
      for (const day of daysInRange) {
        if (scheduling.days.includes(dayOfWeek(day))) {
          drafts.push(makeDraft(activity, day, scheduling.defaultMinutes, scheduling.stepTemplate, sortOrder++));
        }
      }
      continue;
    }

    // daysPerWeek: place at most `target.amount` tasks on the earliest matching preferred days
    // that actually fall within the goal's valid date range.
    const slots = Math.max(0, Math.min(scheduling.daysPerWeek, target.amount));
    const matchingDays = daysInRange.filter((d) => scheduling.preferredDays.includes(dayOfWeek(d))).slice(0, slots);
    for (const day of matchingDays) {
      drafts.push(makeDraft(activity, day, scheduling.defaultMinutes, scheduling.stepTemplate, sortOrder++));
    }
  }

  return drafts;
}

function makeDraft(
  activity: Activity,
  date: LocalDate,
  defaultMinutes: number | null,
  stepTemplate: { title: string; minutes: number | null }[],
  sortOrder: number,
): DailyTaskDraft {
  return {
    goalId: activity.goalId,
    activityId: activity.id,
    milestoneId: null,
    date,
    title: activity.name,
    plannedMinutes: defaultMinutes,
    steps: stepTemplate.map((s) => ({ id: newId<StepId>(), title: s.title, minutes: s.minutes, done: false })),
    sortOrder,
  };
}
