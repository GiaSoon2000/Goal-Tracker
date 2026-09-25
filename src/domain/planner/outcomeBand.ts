/**
 * The outcome band — a random-walk widening range, so a metric goal's projected
 * trajectory stays honestly a RANGE and never a false-precision point prediction
 * (spec §4). See DATA-MODEL.md §3.2 for the derivation.
 */
export function outcomeBandAtWeek(startValue: number, targetValue: number, totalWeeks: number, weekIndex: number, decimals: 0 | 1 | 2, k = 2): { min: number; max: number } {
  if (totalWeeks <= 0) return { min: startValue, max: startValue };
  const weeklyDelta = (targetValue - startValue) / totalWeeks;
  const expected = startValue + weeklyDelta * weekIndex;
  const unitStep = 10 ** -decimals;
  const halfWidth = Math.max(unitStep, k * Math.sqrt(weekIndex) * Math.abs(weeklyDelta));
  return { min: expected - halfWidth, max: expected + halfWidth };
}
