import { weekDetailQuery, type WeekDetailRow } from '../repo/queries';
import type { LocalDate } from '../domain/types';
import { useLive, type Live } from './useLive';

export type { WeekDetailRow };

const NONE: WeekDetailRow[] = [];

export function useWeekDetail(weekStart: LocalDate): Live<WeekDetailRow[]> {
  return useLive(() => weekDetailQuery(weekStart), [weekStart], NONE);
}
