import { describe, expect, it } from 'vitest';
import { outcomeBandAtWeek } from './outcomeBand';

describe('outcomeBandAtWeek — never a false-precision point prediction (spec §4)', () => {
  it('is a real range (min < max) once at least one week has elapsed', () => {
    const { min, max } = outcomeBandAtWeek(43, 50, 28, 10, 1);
    expect(min).toBeLessThan(max);
  });
  it('centers on the linear expectation', () => {
    const { min, max } = outcomeBandAtWeek(43, 50, 28, 14, 1); // halfway
    const mid = (min + max) / 2;
    expect(mid).toBeCloseTo(43 + (50 - 43) * 0.5, 1);
  });
  it('widens as the horizon extends (more weeks out = less certain)', () => {
    const early = outcomeBandAtWeek(43, 50, 28, 2, 1);
    const late = outcomeBandAtWeek(43, 50, 28, 20, 1);
    expect(late.max - late.min).toBeGreaterThan(early.max - early.min);
  });
  it('never collapses to zero width even at week 0', () => {
    const { min, max } = outcomeBandAtWeek(43, 50, 28, 0, 1);
    expect(max - min).toBeGreaterThan(0);
  });
  it('handles a zero-length horizon without dividing by zero', () => {
    const { min, max } = outcomeBandAtWeek(43, 50, 0, 0, 1);
    expect(Number.isFinite(min)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
  });
});
