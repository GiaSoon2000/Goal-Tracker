import { goalsScreenQuery, type GoalsScreenRow } from '../repo/queries';
import { useLive, type Live } from './useLive';

const NONE: GoalsScreenRow[] = [];

export function useGoalsScreen(): Live<GoalsScreenRow[]> {
  return useLive(goalsScreenQuery, [], NONE);
}
