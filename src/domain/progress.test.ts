import { describe, expect, it } from 'vitest';
import { asLocalDate } from './date';
import {
  adherenceFromTally,
  isDateInPause,
  metricRatio,
  tallyWeek,
  weekElapsedFraction,
  weekStatus,
} from './progress';
import type { DailyTask, LocalDate } from './types';

describe('metricRatio — spec §8 "Progress: 7%"', () => {
  it('matches the spec worked example: 43 -> 50 kg, current 43.5', () => {
    expect(metricRatio(43, 50, 43.5)).toBeCloseTo(0.0714, 3);
  });
  it('returns null for a maintenance goal (start === target, EC-P02)', () => {
    expect(metricRatio(50, 50, 50)).toBeNull();
  });
  it('clamps at 0 when the value has not moved at all', () => {
    expect(metricRatio(43, 50, 43)).toBe(0);
  });
  it('clamps at 1 when the value overshoots the target', () => {
    expect(metricRatio(43, 50, 55)).toBe(1);
  });
  it('is direction-agnostic: a decrease goal (80 -> 72 kg) is not negative', () => {
    expect(metricRatio(80, 72, 76)).toBeCloseTo(0.5, 5);
  });
  it('clamps to 0, never negative, when a decrease-goal value regresses upward', () => {
    expect(metricRatio(80, 72, 85)).toBe(0);
  });
});

describe('weekStatus — on track / behind / ahead (PLANNING-ENGINE.md §6)', () => {
  it('is no_target when there is no target', () => {
    expect(weekStatus(0, null, 0.5)).toBe('no_target');
  });
  it('is no_target on Monday morning before any slot has elapsed, never "behind"', () => {
    expect(weekStatus(0, 3, 0)).toBe('no_target');
  });
  it('is on_track when actual matches the elapsed-prorated expectation', () => {
    expect(weekStatus(1, 3, 1 / 3)).toBe('on_track');
  });
  it('is behind when meaningfully under the elapsed-prorated expectation', () => {
    expect(weekStatus(0, 3, 2 / 3)).toBe('behind');
  });
  it('is ahead when meaningfully over the elapsed-prorated expectation', () => {
    expect(weekStatus(3, 3, 1 / 7)).toBe('ahead');
  });
});

describe('weekElapsedFraction', () => {
  it('is 1/7 on the first day of the week', () => {
    const monday = asLocalDate('2026-09-14');
    expect(weekElapsedFraction(monday, monday, 1)).toBeCloseTo(1 / 7, 5);
  });
  it('is 1 (fully elapsed) once the week has passed', () => {
    const monday = asLocalDate('2026-09-14');
    expect(weekElapsedFraction(monday, asLocalDate('2026-09-30'), 1)).toBe(1);
  });
});

describe('tallyWeek / adherenceFromTally — task state arithmetic (EDGE-CASES.md D4/D5)', () => {
  const today = asLocalDate('2026-09-19');
  function task(date: LocalDate, status: DailyTask['status']): DailyTask {
    return {
      id: 'x' as DailyTask['id'],
      goalId: 'g' as DailyTask['goalId'],
      activityId: null,
      milestoneId: null,
      date,
      title: 't',
      plannedMinutes: null,
      status,
      completedAt: null,
      steps: [],
      source: 'generated',
      originalDate: null,
      entryId: null,
      sortOrder: 0,
      createdAt: 0,
      updatedAt: 0,
    };
  }

  it('a skipped task never counts against adherence (excluded from both numerator and denominator)', () => {
    const tasks = [task(asLocalDate('2026-09-17'), 'skipped'), task(asLocalDate('2026-09-18'), 'done')];
    const tally = tallyWeek(tasks, today, () => false);
    expect(tally).toEqual({ done: 1, skipped: 1, missed: 0, pending: 0, planned: 2 });
    expect(adherenceFromTally(tally)).toBe(1); // 1 done / (1 done + 0 missed)
  });
  it('a past pending task becomes "missed" unless the goal was paused that day', () => {
    const past = asLocalDate('2026-09-10');
    const notPaused = tallyWeek([task(past, 'pending')], today, () => false);
    expect(notPaused.missed).toBe(1);
    const paused = tallyWeek([task(past, 'pending')], today, () => true);
    expect(paused.missed).toBe(0);
    expect(paused.pending).toBe(1);
  });
  it('an all-skipped week renders adherence as null ("—"), never 0%', () => {
    const tasks = [task(asLocalDate('2026-09-17'), 'skipped'), task(asLocalDate('2026-09-18'), 'skipped')];
    const tally = tallyWeek(tasks, today, () => false);
    expect(adherenceFromTally(tally)).toBeNull();
  });
});

describe('isDateInPause', () => {
  it('is true inside a closed interval', () => {
    expect(isDateInPause(asLocalDate('2026-09-15'), [{ from: asLocalDate('2026-09-10'), to: asLocalDate('2026-09-20') }])).toBe(true);
  });
  it('is true inside an open (still-paused) interval', () => {
    expect(isDateInPause(asLocalDate('2026-12-01'), [{ from: asLocalDate('2026-09-10'), to: null }])).toBe(true);
  });
  it('is false outside every interval', () => {
    expect(isDateInPause(asLocalDate('2026-01-01'), [{ from: asLocalDate('2026-09-10'), to: asLocalDate('2026-09-20') }])).toBe(false);
  });
});
