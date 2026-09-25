/** Float-safety helpers used everywhere a comparison or a rounded display value is needed. */

export function roundTo(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export function nearlyEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

/** Clamps to [0, 1] for progress bars (spec §5/§13 — never show a negative or >100% bar). */
export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Locale-safe decimal parsing for `<input inputmode="decimal">` fields. Never use
 * `type="number"` or bare `parseFloat` — on a European-locale phone, `parseFloat('43,5')`
 * silently returns `43`, recording the wrong weight with no error.
 */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (s === '') return null;
  // Normalize a single ',' or '.' decimal separator; reject anything with more than one.
  const normalized = s.replace(',', '.');
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
