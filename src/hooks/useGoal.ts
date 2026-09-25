import { getGoal } from '../repo/goalRepo';
import type { Goal, GoalId } from '../domain/types';
import { useLive, type Live } from './useLive';

export function useGoal(goalId: GoalId): Live<Goal | null> {
  return useLive(() => getGoal(goalId), [goalId], null);
}
