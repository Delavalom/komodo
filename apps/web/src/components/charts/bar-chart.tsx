"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { SeriesPoint } from "@/lib/types";

/**
 * Hand-rolled SVG so the axis formatting matches the original exactly
 * (docs/SPEC.md §6.3) rather than whatever a chart library would emit.
 */

const PAD = { top: 18, right: 24, bottom: 44, left: 62 };

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1, 2, 3, 4, 5].slice(0, count + 1);
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) {
    out.push(Number(v.toFixed(6)));
  }
  return out.length > 1 ? out : [0, step];
}

/**
 * The original drops the leading zero on two-decimal fractions (`.25`, `.75`)
 * but keeps it on one-decimal ones (`0.5`). Reproduced verbatim.
 */
export function axisNumber(value: number): string {
  const s = String(Number(value.toFixed(2)));
  return s.startsWith("0.") && s.length === 4 ? s.slice(1) : s;
}

export interface BarChartProps {
  data: SeriesPoint[];
  axisLabel: string;
  formatY?: (value: number) => string;
  showAverage?: boolean;
  height?: number;
  minTop?: number;
  className?: string;
}

export function BarChart({
  data,
  axisLabel,
  formatY = axisNumber,
  showAverage = false,
  height = 268,
  minTop = 5,
  className,
}: BarChartProps) {
  const width = 640;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const rawMax = data.reduce((m, d) => Math.max(m, d.value), 0);
  const ticks = niceTicks(rawMax > 0 ? rawMax : minTop);
  const top = ticks[ticks.length - 1] || minTop;

  const band = data.length ? plotW / data.length : plotW;
  const barW = Math.max(3, Math.min(10, band * 0.46));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  const average = data.length
    ? data.reduce((s, d) => s + d.value, 0) / data.length
    : 0;

  // Day ticks: every other bucket once the series gets dense, as the original.
  const step = data.length > 20 ? 2 : 1;

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={axisLabel}
      >
        <text
          transform={`translate(16 ${PAD.top + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          className="label-mono"
          fontSize="9"
          fill="hsl(var(--muted-foreground))"
        >
          {axisLabel}
        </text>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="hsl(var(--border))"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 3}
              textAnchor="end"
              className="label-mono"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
            >
              {formatY(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          if (d.value <= 0) return null;
          const cx = PAD.left + band * i + band / 2;
          const barY = y(d.value);
          return (
            <rect
              key={d.date}
              x={cx - barW / 2}
              y={barY}
              width={barW}
              height={Math.max(1, PAD.top + plotH - barY)}
              fill="hsl(var(--foreground))"
            />
          );
        })}

        {showAverage ? (
          <g>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(average)}
              y2={y(average)}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={width - PAD.right}
              y={y(average) - 6}
              textAnchor="end"
              className="label-mono"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
            >
              AVERAGE
            </text>
          </g>
        ) : null}

        {data.map((d, i) => {
          if (i % step !== 0) return null;
          const cx = PAD.left + band * i + band / 2;
          const date = new Date(d.date);
          const day = date.getUTCDate();
          return (
            <g key={`tick-${d.date}`}>
              <text
                x={cx}
                y={PAD.top + plotH + 16}
                textAnchor="middle"
                className="label-mono"
                fontSize="9"
                fill="hsl(var(--muted-foreground))"
              >
                {day}
              </text>
              {i === 0 ? (
                <text
                  x={cx}
                  y={PAD.top + plotH + 28}
                  textAnchor="middle"
                  className="label-mono"
                  fontSize="9"
                  fill="hsl(var(--muted-foreground))"
                >
                  {MONTHS_SHORT[date.getUTCMonth()]}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** The tiny inline series in the usage legend. SPEC §8.10 */
export function Sparkline({
  data,
  color,
  width = 76,
  height = 20,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data
    .map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The usage page's multi-series daily bars. SPEC §8.10 */
export function UsageBarChart({
  labels,
  series,
  height = 300,
}: {
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  height?: number;
}) {
  const width = 1120;
  const pad = { top: 20, right: 24, bottom: 36, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const totals = labels.map((_, i) =>
    series.reduce((s, x) => s + (x.values[i] ?? 0), 0),
  );
  const ticks = niceTicks(Math.max(...totals, 0) || 4);
  const top = ticks[ticks.length - 1] || 4;
  const band = labels.length ? plotW / labels.length : plotW;
  const barW = Math.max(6, Math.min(22, band * 0.42));
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Daily credit usage"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(t)}
            y2={y(t)}
            stroke="hsl(var(--border))"
          />
          <text
            x={pad.left - 10}
            y={y(t) + 3}
            textAnchor="end"
            fontSize="10"
            fill="hsl(var(--muted-foreground))"
          >
            {axisNumber(t)}
          </text>
        </g>
      ))}
      {labels.map((label, i) => {
        const cx = pad.left + band * i + band / 2;
        let cursor = 0;
        return (
          <g key={label}>
            {series.map((s) => {
              const v = s.values[i] ?? 0;
              if (v <= 0) return null;
              const y0 = y(cursor);
              cursor += v;
              const y1 = y(cursor);
              return (
                <rect
                  key={s.name}
                  x={cx - barW / 2}
                  y={y1}
                  width={barW}
                  height={Math.max(1, y0 - y1)}
                  fill={s.color}
                />
              );
            })}
            <text
              x={cx}
              y={pad.top + plotH + 18}
              textAnchor="middle"
              fontSize="10"
              fill="hsl(var(--muted-foreground))"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
