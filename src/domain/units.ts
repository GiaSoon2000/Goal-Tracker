/**
 * The entire fix for the kg<->lb corruption trap lives here. Switching a display
 * unit is a pure read-time formatting choice; no stored value is ever converted
 * or rewritten. There is deliberately no `convertAllEntries` function anywhere.
 */
import type { CanonicalUnit, DisplayUnit } from './types';
import { roundTo } from './num';

export const UNIT_TABLE: Record<DisplayUnit, { canonical: CanonicalUnit; factor: number; dp: number }> = {
  kg: { canonical: 'kg', factor: 1, dp: 1 },
  lb: { canonical: 'kg', factor: 0.45359237, dp: 1 }, // exact by definition
  km: { canonical: 'km', factor: 1, dp: 2 },
  mi: { canonical: 'km', factor: 1.609344, dp: 2 }, // exact by definition
  min: { canonical: 'min', factor: 1, dp: 0 },
  h: { canonical: 'min', factor: 60, dp: 0 },
  count: { canonical: 'count', factor: 1, dp: 0 },
};

export function toCanonical(value: number, unit: DisplayUnit): number {
  return roundTo(value * UNIT_TABLE[unit].factor, 6);
}
export function fromCanonical(value: number, unit: DisplayUnit): number {
  return value / UNIT_TABLE[unit].factor;
}
export function compatible(a: DisplayUnit, b: DisplayUnit): boolean {
  return UNIT_TABLE[a].canonical === UNIT_TABLE[b].canonical;
}

/**
 * If the entry's own unit matches the requested display unit, print the verbatim
 * entryValue/entryUnit — byte-identical to what the user typed, forever. Otherwise
 * convert the canonical value at read time.
 */
export function formatEntry(v: { n: number; entryValue: number; entryUnit: DisplayUnit }, display: DisplayUnit): string {
  if (v.entryUnit === display) return `${v.entryValue} ${display}`;
  const dp = UNIT_TABLE[display].dp;
  return `${roundTo(fromCanonical(v.n, display), dp)} ${display}`;
}

/** Soft sanity bounds per canonical unit — used to catch a typo (4300 kg) without hard-blocking it. */
export const SANITY_BOUNDS: Record<CanonicalUnit, { min: number; max: number }> = {
  kg: { min: 1, max: 640 },
  km: { min: 0, max: 1000 },
  min: { min: 0, max: 1440 },
  count: { min: 0, max: 1000 },
};

export function isWithinSanityBounds(value: number, unit: CanonicalUnit): boolean {
  const b = SANITY_BOUNDS[unit];
  return value >= b.min && value <= b.max;
}
