import { progressChartsQuery, type ProgressChartData } from '../repo/queries';
import type { GoalId, LocalDate, WeekStart } from '../domain/types';
import { useLive, type Live } from './useLive';

const EMPTY: ProgressChartData = { metric: null, weeks: [], milestones: [] };

export function useProgressCharts(goalId: GoalId, today: LocalDate, weekStartsOn: WeekStart): Live<ProgressChartData> {
  return useLive(() => progressChartsQuery(goalId, today, weekStartsOn), [goalId, today, weekStartsOn], EMPTY);
}
