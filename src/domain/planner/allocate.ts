/**
 * Integer largest-remainder allocation. Guarantees the parts sum EXACTLY to `total`
 * (never 6.999999999999998 from naive float division), and weights let a partial
 * first/last week get a proportionally smaller share (EDGE-CASES.md EC-P07/EC-T08/EC-T09).
 */
export function allocateLargestRemainder(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum <= 0 || weights.length === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map(Math.floor);
  const allocated = floors.reduce((s, f) => s + f, 0);
  let remainder = total - allocated;

  const remainders = raw.map((r, i) => ({ i, frac: r - (floors[i] ?? 0) })).sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < remainders.length && remainder > 0; k++) {
    const idx = remainders[k]?.i;
    if (idx === undefined) continue;
    result[idx] = (result[idx] ?? 0) + 1;
    remainder--;
  }
  return result;
}
