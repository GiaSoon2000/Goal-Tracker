import { listTasksForDate } from '../repo/taskRepo';
import type { DailyTask, LocalDate } from '../domain/types';
import { useLive, type Live } from './useLive';

const NONE: DailyTask[] = [];

export function useTasksForDate(date: LocalDate): Live<DailyTask[]> {
  return useLive(() => listTasksForDate(date), [date], NONE);
}
