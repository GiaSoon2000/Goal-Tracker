import { describe, expect, it } from 'vitest';
import { allocateLargestRemainder } from './allocate';

describe('allocateLargestRemainder', () => {
  it('sums exactly to the total for an even split', () => {
    const result = allocateLargestRemainder(9, [1, 1, 1]);
    expect(result.reduce((s, n) => s + n, 0)).toBe(9);
    expect(result).toEqual([3, 3, 3]);
  });

  it('sums exactly to the total for an uneven split (never drifts by float error)', () => {
    const weights = Array.from({ length: 28 }, () => 1);
    const result = allocateLargestRemainder(7000, weights); // 7000 g over 28 weeks, incl. partials
    expect(result.reduce((s, n) => s + n, 0)).toBe(7000);
  });

  it('handles fractional partial-week weights (first/last week proration)', () => {
    const weights = [2 / 7, 1, 1, 1, 3 / 7]; // partial first & last week
    const result = allocateLargestRemainder(10, weights);
    expect(result.reduce((s, n) => s + n, 0)).toBe(10);
    // Partial weeks should get proportionally less than full weeks.
    expect(result[0]).toBeLessThanOrEqual(result[1] as number);
  });

  it('returns all zeros when total is 0', () => {
    expect(allocateLargestRemainder(0, [1, 1, 1])).toEqual([0, 0, 0]);
  });

  it('returns all zeros when weights sum to 0', () => {
    expect(allocateLargestRemainder(10, [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('returns an empty array for an empty weights list', () => {
    expect(allocateLargestRemainder(10, [])).toEqual([]);
  });
});
