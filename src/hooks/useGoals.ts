import { listActiveGoals, listGoalsByStatus } from '../repo/goalRepo';
import type { Goal, GoalStatus } from '../domain/types';
import { useLive, type Live } from './useLive';

const NONE: Goal[] = [];

export function useActiveGoals(): Live<Goal[]> {
  return useLive(listActiveGoals, [], NONE);
}

export function useGoalsByStatus(status: GoalStatus): Live<Goal[]> {
  return useLive(() => listGoalsByStatus(status), [status], NONE);
}
