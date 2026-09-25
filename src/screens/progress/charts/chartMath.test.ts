import { describe, expect, it } from 'vitest';
import { linearScale, nearestIndex, niceTicks } from './chartMath';

describe('linearScale', () => {
  it('maps the domain endpoints to the range endpoints', () => {
    const scale = linearScale(0, 100, 0, 300);
    expect(scale.toPx(0)).toBe(0);
    expect(scale.toPx(100)).toBe(300);
    expect(scale.toPx(50)).toBe(150);
  });
  it('inverts correctly', () => {
    const scale = linearScale(0, 100, 0, 300);
    expect(scale.toValue(150)).toBe(50);
  });
  it('does not divide by zero for a degenerate domain', () => {
    const scale = linearScale(5, 5, 0, 100);
    expect(Number.isFinite(scale.toPx(5))).toBe(true);
  });
});

describe('niceTicks', () => {
  it('produces round numbers, never raw fractions', () => {
    const ticks = niceTicks(43, 50);
    for (const t of ticks) expect(Number.isFinite(t)).toBe(true);
    expect(ticks.length).toBeGreaterThan(0);
  });
  it('handles a zero-span domain without crashing', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});

describe('nearestIndex', () => {
  it('finds the closest value in an unsorted-safe way', () => {
    expect(nearestIndex([0, 10, 20, 30], 22)).toBe(2);
    expect(nearestIndex([0, 10, 20, 30], 0), 'exact match at start').toBe(0);
    expect(nearestIndex([0, 10, 20, 30], 30), 'exact match at end').toBe(3);
  });
  it('returns 0 for an empty array without throwing', () => {
    expect(nearestIndex([], 5)).toBe(0);
  });
});
