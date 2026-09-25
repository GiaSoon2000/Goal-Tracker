import { describe, expect, it } from 'vitest';
import { asLocalDate } from '../date';
import { currentMilestone, spreadMilestones } from './milestones';
import { GOAL_TEMPLATES } from './templates';

describe('spreadMilestones — piano worked example (PLANNING-ENGINE.md §8.3)', () => {
  const startDate = asLocalDate('2026-09-19');
  const deadline = asLocalDate('2027-06-30'); // resolveDeadline({month, '2027-06'})

  it('spreads the piano template milestones across the timeline in order', () => {
    const result = spreadMilestones(GOAL_TEMPLATES.pianoBeginner!.milestones, startDate, deadline);
    expect(result).toHaveLength(5);
    expect(result.map((m) => m.title)).toEqual(['Posture & hand position', 'Basic chords', 'Major scales', 'First song', 'Second song']);
    expect(result[0]!.order).toBe(0);
    expect(result[4]!.order).toBe(4);
  });

  it('the last milestone (atFraction: 1.0) lands exactly on the deadline', () => {
    const result = spreadMilestones(GOAL_TEMPLATES.pianoBeginner!.milestones, startDate, deadline);
    expect(result[4]!.targetDate).toBe(deadline);
  });

  it('every generated date is clamped within [startDate, deadline]', () => {
    const result = spreadMilestones(GOAL_TEMPLATES.pianoBeginner!.milestones, startDate, deadline);
    for (const m of result) {
      expect(m.targetDate! >= startDate).toBe(true);
      expect(m.targetDate! <= deadline).toBe(true);
    }
  });

  it('spaces milestones 28 days apart when there is no deadline (open-ended goal)', () => {
    const result = spreadMilestones(GOAL_TEMPLATES.genericSkill!.milestones, startDate, null);
    expect(result[0]!.targetDate).toBe(startDate);
    expect(result[1]!.targetDate).toBe('2026-10-17'); // +28 days
    expect(result[2]!.targetDate).toBe('2026-11-14'); // +56 days
  });
});

describe('currentMilestone', () => {
  it('is the first not-done milestone', () => {
    const milestones = [
      { order: 0, status: 'done' as const },
      { order: 1, status: 'pending' as const },
      { order: 2, status: 'pending' as const },
    ];
    expect(currentMilestone(milestones)?.order).toBe(1);
  });
  it('falls back to the last milestone when all are done', () => {
    const milestones = [
      { order: 0, status: 'done' as const },
      { order: 1, status: 'done' as const },
    ];
    expect(currentMilestone(milestones)?.order).toBe(1);
  });
  it('is null for an empty list', () => {
    expect(currentMilestone([])).toBeNull();
  });
});
