/** Shared pure geometry helpers for the hand-rolled inline-SVG charts (ARCHITECTURE.md §1.1 —
 *  no chart library dependency). Kept separate from the components so the scale math is testable
 *  without rendering anything. */

export interface Scale {
  toPx: (value: number) => number;
  toValue: (px: number) => number;
}

/** Linear scale mapping [domainMin, domainMax] -> [rangeMin, rangeMax], clamped at the domain edges. */
export function linearScale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): Scale {
  const domainSpan = domainMax - domainMin || 1;
  const rangeSpan = rangeMax - rangeMin;
  return {
    toPx: (v) => rangeMin + ((v - domainMin) / domainSpan) * rangeSpan,
    toValue: (px) => domainMin + ((px - rangeMin) / rangeSpan) * domainSpan,
  };
}

/** "Nice" round axis ticks — never raw floating values (marks-and-anatomy.md: round to clean numbers). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  const step = niceResidual * magnitude;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 1e-6; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

export function catmullRomPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function nearestIndex(xs: number[], target: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs((xs[i] ?? 0) - target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
