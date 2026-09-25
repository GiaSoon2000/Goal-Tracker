import { useId, useMemo, useRef, useState } from 'react';
import { diffDays, formatDay, weeksBetween } from '../../../domain/date';
import { outcomeBandAtWeek } from '../../../domain/planner/outcomeBand';
import type { LocalDate } from '../../../domain/types';
import { catmullRomPath, linearScale, nearestIndex, niceTicks } from './chartMath';
import s from './charts.module.css';

export interface MetricPoint {
  date: LocalDate;
  value: number;
}

interface Props {
  entries: MetricPoint[]; // one per day already (EC-M01 collapse — see progress hook)
  startDate: LocalDate;
  deadlineDate: LocalDate | null;
  startValue: number;
  targetValue: number;
  decimals: 0 | 1 | 2;
  unit: string;
  today: LocalDate;
}

const W = 320;
const H = 160;
const PAD = { top: 12, right: 8, bottom: 20, left: 34 };

/**
 * A single-series trend line (spec §13) plus the outcome BAND (never a bare point
 * prediction — spec §4) and a dashed target reference. One series -> no legend
 * box needed (marks-and-anatomy.md); the title above this component names it.
 */
export function MetricLineChart({ entries, startDate, deadlineDate, startValue, targetValue, decimals, unit, today }: Props) {
  const gradientId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const xEnd = deadlineDate && deadlineDate > today ? deadlineDate : today;
  const totalWeeks = deadlineDate ? Math.max(1, weeksBetween(startDate, deadlineDate) + 1) : null;

  const xScale = useMemo(() => linearScale(0, Math.max(1, diffDays(startDate, xEnd)), PAD.left, W - PAD.right), [startDate, xEnd]);

  const bandPoints = useMemo(() => {
    if (!totalWeeks || !deadlineDate) return [];
    const pts: { day: number; min: number; max: number }[] = [];
    for (let w = 0; w <= totalWeeks - 1; w++) {
      const day = Math.round((w / (totalWeeks - 1 || 1)) * diffDays(startDate, deadlineDate));
      const band = outcomeBandAtWeek(startValue, targetValue, totalWeeks - 1, w, decimals);
      pts.push({ day, min: band.min, max: band.max });
    }
    return pts;
  }, [totalWeeks, deadlineDate, startDate, startValue, targetValue, decimals]);

  const allValues = [startValue, targetValue, ...entries.map((e) => e.value), ...bandPoints.flatMap((b) => [b.min, b.max])];
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yPad = (yMax - yMin) * 0.15 || 1;
  const yScale = useMemo(() => linearScale(yMin - yPad, yMax + yPad, H - PAD.bottom, PAD.top), [yMin, yMax, yPad]);

  const dataPx = entries.map((e) => ({ x: xScale.toPx(diffDays(startDate, e.date)), y: yScale.toPx(e.value) }));
  const linePath = catmullRomPath(dataPx);

  const bandPath =
    bandPoints.length > 1
      ? `M ${bandPoints.map((p) => `${xScale.toPx(p.day)} ${yScale.toPx(p.max)}`).join(' L ')} L ${[...bandPoints]
          .reverse()
          .map((p) => `${xScale.toPx(p.day)} ${yScale.toPx(p.min)}`)
          .join(' L ')} Z`
      : '';

  const yTicks = niceTicks(yMin - yPad, yMax + yPad, 3);
  const last = entries[entries.length - 1];

  function handlePointer(clientX: number) {
    if (entries.length === 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const idx = nearestIndex(
      dataPx.map((p) => p.x),
      svgX,
    );
    setHoverIndex(idx);
  }

  const hovered = hoverIndex !== null ? entries[hoverIndex] : null;
  const hoveredPx = hoverIndex !== null ? dataPx[hoverIndex] : null;

  return (
    <div ref={containerRef} className={s.chartWrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={s.svg}
        role="img"
        aria-label={`Trend from ${startValue} to ${targetValue} ${unit}, current ${last ? last.value : startValue} ${unit}`}
        onPointerMove={(e) => handlePointer(e.clientX)}
        onPointerDown={(e) => handlePointer(e.clientX)}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yScale.toPx(t)} y2={yScale.toPx(t)} className={s.gridline} />
            <text x={PAD.left - 6} y={yScale.toPx(t)} className={s.axisLabel} textAnchor="end" dominantBaseline="middle">
              {t.toFixed(decimals)}
            </text>
          </g>
        ))}

        {bandPath && <path d={bandPath} fill="var(--accent)" opacity={0.1} stroke="none" />}

        <line x1={PAD.left} x2={W - PAD.right} y1={yScale.toPx(targetValue)} y2={yScale.toPx(targetValue)} className={s.targetLine} />

        {linePath && <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

        {dataPx.length > 0 && (
          <circle cx={dataPx[dataPx.length - 1]!.x} cy={dataPx[dataPx.length - 1]!.y} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        )}

        {hoveredPx && (
          <>
            <line x1={hoveredPx.x} x2={hoveredPx.x} y1={PAD.top} y2={H - PAD.bottom} className={s.crosshair} />
            <circle cx={hoveredPx.x} cy={hoveredPx.y} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}

        <text x={PAD.left} y={H - 4} className={s.axisLabel}>
          {formatDay(startDate)}
        </text>
        <text x={W - PAD.right} y={H - 4} className={s.axisLabel} textAnchor="end">
          {formatDay(xEnd)}
        </text>
      </svg>

      {hovered && (
        <div className={s.tooltip} style={{ left: `${(hoveredPx!.x / W) * 100}%` }}>
          <strong>
            {hovered.value} {unit}
          </strong>
          <span>{formatDay(hovered.date)}</span>
        </div>
      )}

      <table className="srOnly">
        <caption>Trend data</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.date}>
              <td>{e.date}</td>
              <td>
                {e.value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
