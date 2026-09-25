import { describe, expect, it } from 'vitest';
import { compatible, formatEntry, fromCanonical, isWithinSanityBounds, toCanonical } from './units';

describe('toCanonical / fromCanonical', () => {
  it('kg is already canonical', () => {
    expect(toCanonical(43.5, 'kg')).toBe(43.5);
  });
  it('converts lb to canonical kg', () => {
    expect(toCanonical(95, 'lb')).toBeCloseTo(43.091275, 6);
  });
  it('round-trips lb -> kg -> lb', () => {
    const kg = toCanonical(95, 'lb');
    expect(fromCanonical(kg, 'lb')).toBeCloseTo(95, 4);
  });
});

describe('compatible', () => {
  it('kg and lb share the mass canonical bucket', () => {
    expect(compatible('kg', 'lb')).toBe(true);
  });
  it('min and kg are not compatible', () => {
    expect(compatible('min', 'kg')).toBe(false);
  });
});

describe('formatEntry — the corruption-trap fix (EDGE-CASES.md D6/EC-M08)', () => {
  it('prints the verbatim entry when the display unit matches', () => {
    const v = { n: 43.5, entryValue: 43.5, entryUnit: 'kg' as const };
    expect(formatEntry(v, 'kg')).toBe('43.5 kg');
  });
  it('converts from canonical when the display unit differs', () => {
    const v = { n: 43.5, entryValue: 43.5, entryUnit: 'kg' as const };
    expect(formatEntry(v, 'lb')).toBe('95.9 lb');
  });
  it('round-trips kg -> lb -> kg back to the exact original verbatim string', () => {
    const v = { n: 43.5, entryValue: 43.5, entryUnit: 'kg' as const };
    const asLb = formatEntry(v, 'lb');
    expect(asLb).toBe('95.9 lb');
    // Switching back to kg must be byte-identical to the first render — no stored value moved.
    expect(formatEntry(v, 'kg')).toBe('43.5 kg');
  });
  it('an entry logged in lb formats natively in lb and converts to kg on display switch', () => {
    const n = toCanonical(95, 'lb');
    const v = { n, entryValue: 95, entryUnit: 'lb' as const };
    expect(formatEntry(v, 'lb')).toBe('95 lb');
    expect(formatEntry(v, 'kg')).toBe('43.1 kg');
  });
});

describe('isWithinSanityBounds', () => {
  it('flags an implausible weight as out of bounds', () => {
    expect(isWithinSanityBounds(4300, 'kg')).toBe(false);
  });
  it('accepts a normal weight', () => {
    expect(isWithinSanityBounds(70, 'kg')).toBe(true);
  });
  it('rejects a negative value', () => {
    expect(isWithinSanityBounds(-5, 'kg')).toBe(false);
  });
});
