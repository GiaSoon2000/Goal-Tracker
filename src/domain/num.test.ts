import { describe, expect, it } from 'vitest';
import { nearlyEqual, parseDecimal, roundTo } from './num';

describe('roundTo', () => {
  it('rounds to the given decimal places', () => {
    expect(roundTo(43.549, 1)).toBe(43.5);
    expect(roundTo(43.55, 1)).toBe(43.6);
    expect(roundTo(1.5, 0)).toBe(2);
  });
});

describe('nearlyEqual', () => {
  it('treats float-accumulation noise as equal', () => {
    expect(nearlyEqual(0.1 + 0.2, 0.3)).toBe(true);
  });
  it('treats a real difference as not equal', () => {
    expect(nearlyEqual(1, 1.1)).toBe(false);
  });
});

describe('parseDecimal — locale safety (EDGE-CASES.md EC-M09)', () => {
  it('parses a plain decimal', () => {
    expect(parseDecimal('43.5')).toBe(43.5);
  });
  it('parses a comma decimal separator (EU locale)', () => {
    expect(parseDecimal('43,5')).toBe(43.5);
  });
  it('strips thousands spaces', () => {
    expect(parseDecimal('1 234,5')).toBe(1234.5);
  });
  it('rejects a value with two decimal points', () => {
    expect(parseDecimal('43.5.1')).toBeNull();
  });
  it('rejects empty input', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
  });
  it('rejects non-numeric input', () => {
    expect(parseDecimal('abc')).toBeNull();
  });
  it('never silently truncates like parseFloat does', () => {
    // The bug this function exists to prevent: parseFloat('43,5') === 43.
    expect(parseDecimal('43,5')).not.toBe(43);
  });
});
