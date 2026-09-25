import { todayScreenQuery, type TodayScreenData } from '../repo/queries';
import type { LocalDate } from '../domain/types';
import { useLive, type Live } from './useLive';

const EMPTY: TodayScreenData = { goals: [], summaries: [], tasks: [] };

export function useTodayScreen(today: LocalDate, weekStartsOn: 0 | 1): Live<TodayScreenData> {
  return useLive(() => todayScreenQuery(today, weekStartsOn), [today, weekStartsOn], EMPTY);
}
