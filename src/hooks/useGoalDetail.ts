import { goalDetailQuery, type GoalDetailData } from '../repo/queries';
import type { GoalId, LocalDate } from '../domain/types';
import { useLive, type Live } from './useLive';

const EMPTY: GoalDetailData = { goal: null, activities: [], milestones: [], progress: null, weekSummary: null };

export function useGoalDetail(goalId: GoalId, today: LocalDate, weekStartsOn: 0 | 1): Live<GoalDetailData> {
  return useLive(() => goalDetailQuery(goalId, today, weekStartsOn), [goalId, today, weekStartsOn], EMPTY);
}
