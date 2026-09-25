import { addDays, clampDate, diffDays } from '../date';
import type { LocalDate, MilestoneStatus } from '../types';
import type { MilestoneDraft } from './templates';

export interface SpreadMilestone {
  title: string;
  description?: string;
  targetDate: LocalDate | null;
  order: number;
  status: MilestoneStatus;
  source: 'generated';
}

/**
 * Spreads template milestone drafts across a timeline. With a deadline, dates are
 * an even fraction of [startDate, deadline] — the app has no basis to know a
 * milestone is harder than another, so even spacing is honest about that ignorance.
 * Without one (open-ended habit/skill goal), a flat 4-week cadence is used instead.
 */
export function spreadMilestones(drafts: MilestoneDraft[], startDate: LocalDate, deadline: LocalDate | null): SpreadMilestone[] {
  return drafts.map((draft, order) => {
    let targetDate: LocalDate | null;
    if (deadline) {
      const totalDays = diffDays(startDate, deadline);
      const offset = Math.round(draft.atFraction * totalDays);
      targetDate = clampDate(addDays(startDate, offset), startDate, deadline);
    } else {
      targetDate = addDays(startDate, order * 28);
    }
    return {
      title: draft.title,
      ...(draft.description !== undefined ? { description: draft.description } : {}),
      targetDate,
      order,
      status: 'pending' as const,
      source: 'generated' as const,
    };
  });
}

/** "Current milestone" (spec §8/§9): the first not-done, not-skipped one, or the last if all are done. */
export function currentMilestone<M extends { status: MilestoneStatus; order: number }>(milestones: M[]): M | null {
  const sorted = [...milestones].sort((a, b) => a.order - b.order);
  return sorted.find((m) => m.status !== 'done' && m.status !== 'skipped') ?? sorted[sorted.length - 1] ?? null;
}
