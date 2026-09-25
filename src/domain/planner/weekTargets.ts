/**
 * Per-week target proration — the fix for "week 1 always reads Behind" (EDGE-CASES.md
 * EC-T08/EC-T09). A partial first/last week gets a proportionally smaller target,
 * based on how many of its scheduling slots actually fall inside [startDate, deadline].
 */
import { dayOfWeek, weekDays } from '../date';
import type { Activity, ActivityId, LocalDate, WeekStart, WeeklyTarget } from '../types';

/**
 * The fraction (0..1) of a full week's slots for `activity` that actually fall
 * inside [goalStartDate, goalDeadline] for the given week. 1 for an interior
 * week, less for a partial first/last week, 1 for scheduling modes that have no
 * slot concept (fixedDays/none — proration doesn't apply to them).
 */
export function activityWeekWeight(activity: Pick<Activity, 'scheduling'>, weekStart: LocalDate, goalStartDate: LocalDate, goalDeadline: LocalDate | null): number {
  const { scheduling } = activity;
  if (scheduling.mode !== 'daysPerWeek') return 1;
  const fullWeekSlots = Math.min(scheduling.daysPerWeek, scheduling.preferredDays.length);
  if (fullWeekSlots <= 0) return 0;
  const days = weekDays(weekStart);
  const availableDays = days.filter((d) => scheduling.preferredDays.includes(dayOfWeek(d)) && d >= goalStartDate && (!goalDeadline || d <= goalDeadline));
  const availableSlots = Math.min(scheduling.daysPerWeek, availableDays.length);
  return availableSlots / fullWeekSlots;
}

export function weekTargetsFor(activities: Activity[], weekStart: LocalDate, _weekStartsOn: WeekStart, goalStartDate: LocalDate, goalDeadline: LocalDate | null): WeeklyTarget[] {
  const targets: WeeklyTarget[] = [];

  for (const activity of activities) {
    if (activity.role !== 'input' || !activity.defaultTarget) continue;
    const { defaultTarget } = activity;
    const weight = activityWeekWeight(activity, weekStart, goalStartDate, goalDeadline);
    const amount = clamp(Math.round(defaultTarget.amount * weight), 0, defaultTarget.amount);
    targets.push({ activityId: activity.id as ActivityId, aggregate: defaultTarget.aggregate, amount, band: defaultTarget.band });
  }

  return targets;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
