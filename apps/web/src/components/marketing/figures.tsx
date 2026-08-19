/**
 * Media placeholders. docs/SPEC-MARKETING.md §M12.3.
 *
 * The original carries photography, product screenshots and bespoke
 * illustration. This repo ships no binary assets, so each of those becomes a
 * generated figure in the same aspect ratio and visual register: dither
 * fields, contour plots, lissajous curves, wireframe grids, abstracted diffs
 * and node graphs.
 *
 * Everything is drawn from `rng(seed)` so the markup is identical on the
 * server and the client (AGENTS.md rule 5).
 */

import type { FigureVariant } from "@/lib/marketing-types";
import { cn, rng } from "@/lib/utils";

import { MonoLabel } from "./ui";

const GREEN = "#28e99f";
const POLLEN = "#ecffa3";
const ORCHID = "#ffacfe";
const POND = "#5882ff";
const TREEFROG = "#756cf5";

/* ── Lissajous ─────────────────────────────────────────────────────── */

export function Lissajous({
  seed = "lissajous",
  className,
  stroke = ORCHID,
}: {
  seed?: string;
  className?: string;
  stroke?: string;
}) {
  const next = rng(`fig:${seed}`);
  const a = 2 + Math.floor(next() * 4);
  const b = 3 + Math.floor(next() * 4);
  const lines = Array.from({ length: 14 }, (_, i) => {
    const phase = (i / 14) * Math.PI;
    const points = Array.from({ length: 120 }, (_, s) => {
      const t = (s / 119) * Math.PI * 2;
      const x = 200 + 185 * Math.sin(a * t + phase);
      const y = 120 + 105 * Math.sin(b * t);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return { points, opacity: 0.16 + (i / 14) * 0.4 };
  });

  return (
    <svg
      viewBox="0 0 400 240"
      aria-hidden
      className={cn("h-full w-full", className)}
    >
      {lines.map((l, i) => (
        <polyline
          key={i}
          points={l.points}
          fill="none"
          stroke={stroke}
          strokeWidth="0.7"
          opacity={l.opacity}
        />
      ))}
    </svg>
  );
}

/* ── Contour field ─────────────────────────────────────────────────── */

export function Contour({
  seed = "contour",
  className,
  stroke = POND,
}: {
  seed?: string;
  className?: string;
  stroke?: string;
}) {
  const next = rng(`fig:${seed}`);
  const peaks = Array.from({ length: 3 }, () => ({
    x: 60 + next() * 280,
    h: 30 + next() * 60,
    w: 50 + next() * 90,
  }));

  const rows = Array.from({ length: 26 }, (_, i) => {
    const base = 40 + i * 7;
    const points = Array.from({ length: 60 }, (_, s) => {
      const x = (s / 59) * 400;
      let y = base;
      for (const pk of peaks) {
        const d = (x - pk.x) / pk.w;
        y -= pk.h * Math.exp(-d * d) * (1 - i / 34);
      }
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return points;
  });

  return (
    <svg
      viewBox="0 0 400 240"
      aria-hidden
      className={cn("h-full w-full", className)}
    >
      {rows.map((points, i) => (
        <polyline
          key={i}
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="0.8"
          opacity={0.5 - i * 0.012}
        />
      ))}
    </svg>
  );
}

/* ── Wireframe mesh ────────────────────────────────────────────────── */

export function Wireframe({
  seed = "wireframe",
  className,
  stroke = TREEFROG,
}: {
  seed?: string;
  className?: string;
  stroke?: string;
}) {
  const next = rng(`fig:${seed}`);
  const cols = 16;
  const rows = 10;
  const jitter = () => (next() - 0.5) * 8;
  const grid = Array.from({ length: rows + 1 }, (_, r) =>
    Array.from({ length: cols + 1 }, (_, c) => ({
      x: (c / cols) * 400 + jitter(),
      y: 20 + (r / rows) * 200 + Math.sin((c / cols) * Math.PI * 2) * 14,
    })),
  );

  return (
    <svg
      viewBox="0 0 400 240"
      aria-hidden
      className={cn("h-full w-full", className)}
    >
      {grid.map((row, r) => (
        <polyline
          key={`r${r}`}
          points={row.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth="0.6"
          opacity="0.35"
        />
      ))}
      {Array.from({ length: cols + 1 }, (_, c) => (
        <polyline
          key={`c${c}`}
          points={grid
            .map((row) => `${row[c].x.toFixed(1)},${row[c].y.toFixed(1)}`)
            .join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth="0.6"
          opacity="0.22"
        />
      ))}
    </svg>
  );
}

/* ── Node graph ────────────────────────────────────────────────────── */

export function NodeGraph({
  seed = "graph",
  className,
}: {
  seed?: string;
  className?: string;
}) {
  const next = rng(`fig:${seed}`);
  const nodes = Array.from({ length: 22 }, (_, i) => ({
    id: i,
    x: 30 + next() * 340,
    y: 25 + next() * 190,
    r: 2 + next() * 4,
  }));
  const edges = nodes.slice(1).map((n, i) => ({
    from: nodes[Math.floor(next() * (i + 1))],
    to: n,
  }));

  return (
    <svg
      viewBox="0 0 400 240"
      aria-hidden
      className={cn("h-full w-full", className)}
    >
      {edges.map((e, i) => (
        <line
          key={i}
          x1={e.from.x}
          y1={e.from.y}
          x2={e.to.x}
          y2={e.to.y}
          stroke="currentColor"
          strokeWidth="0.6"
          opacity="0.3"
        />
      ))}
      {nodes.map((n) => (
        <circle
          key={n.id}
          cx={n.x}
          cy={n.y}
          r={n.r}
          fill={n.id % 5 === 0 ? GREEN : "currentColor"}
          opacity={n.id % 5 === 0 ? 0.9 : 0.45}
        />
      ))}
    </svg>
  );
}

/* ── Abstracted diff ───────────────────────────────────────────────── */

export function DiffFigure({
  seed = "diff",
  className,
  rows = 9,
}: {
  seed?: string;
  className?: string;
  rows?: number;
}) {
  const next = rng(`fig:${seed}`);
  const lines = Array.from({ length: rows }, (_, i) => ({
    sign: next() > 0.68 ? (next() > 0.5 ? "+" : "-") : " ",
    width: 22 + next() * 68,
    key: i,
  }));

  return (
    <div
      aria-hidden
      className={cn(
        "flex h-full w-full flex-col justify-center gap-[6px] border border-current/12 bg-current/[0.04] p-4",
        className,
      )}
    >
      {lines.map((l) => (
        <div key={l.key} className="flex items-center gap-3">
          <span className="w-4 font-label text-[10px] opacity-35">
            {String(l.key + 1).padStart(2, "0")}
          </span>
          <span className="w-2 font-label text-[10px] opacity-50">{l.sign}</span>
          <span
            className="h-[9px]"
            style={{
              width: `${l.width}%`,
              opacity: l.sign === " " ? 0.16 : 1,
              background:
                l.sign === "+"
                  ? "rgba(40,233,159,0.5)"
                  : l.sign === "-"
                    ? "rgba(255,172,254,0.55)"
                    : "currentColor",
            }}
          />
        </div>
      ))}
    </div>
  );
}

/* ── Dither field ──────────────────────────────────────────────────── */

/**
 * The 1-bit halftone the original uses for its photography. Density falls off
 * radially, which reads as a lit subject against the page ground.
 */
export function DitherField({
  seed = "dither",
  className,
  glow = POLLEN,
}: {
  seed?: string;
  className?: string;
  glow?: string;
}) {
  const next = rng(`fig:${seed}`);
  const dots: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 9000; i++) {
    const x = next() * 300;
    const y = next() * 380;
    const dx = (x - 150) / 150;
    const dy = (y - 190) / 190;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1) continue;
    if (next() > Math.pow(d, 1.7) * 1.15) continue;
    dots.push({ x, y, r: 0.55 + next() * 1.1 });
  }

  return (
    <svg
      viewBox="0 0 300 380"
      aria-hidden
      className={cn("h-full w-full", className)}
    >
      <ellipse cx="150" cy="190" rx="140" ry="180" fill={glow} opacity="0.5" />
      <ellipse cx="150" cy="190" rx="132" ry="172" fill="#fefefe" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#111" />
      ))}
    </svg>
  );
}

/** The pixel-wave band that separates a dark hero from the light body. §M8.1 */
export function PixelWave({ className }: { className?: string }) {
  const next = rng("fig:pixelwave");
  const cols = 120;
  const cells: { c: number; r: number }[] = [];
  for (let c = 0; c < cols; c++) {
    const h = 3 + Math.round((Math.sin((c / cols) * Math.PI * 8) + 1) * 3.4);
    for (let r = 0; r < 12; r++) {
      if (r < 12 - h) continue;
      if (next() > 0.35 + (r - (12 - h)) / h) continue;
      cells.push({ c, r });
    }
  }
  return (
    <svg
      viewBox={`0 0 ${cols * 4} 48`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-12 w-full", className)}
    >
      {cells.map((cell, i) => (
        <rect
          key={i}
          x={cell.c * 4}
          y={cell.r * 4}
          width="3"
          height="3"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

/* ── Dispatcher ────────────────────────────────────────────────────── */

export function Figure({
  variant,
  seed,
  caption,
  className,
}: {
  variant: FigureVariant;
  seed?: string;
  caption?: string;
  className?: string;
}) {
  const key = seed ?? variant;
  const inner = {
    dither: <DitherField seed={key} />,
    contour: <Contour seed={key} />,
    lissajous: <Lissajous seed={key} />,
    wireframe: <Wireframe seed={key} />,
    diff: <DiffFigure seed={key} />,
    graph: <NodeGraph seed={key} />,
  }[variant];

  return (
    <figure className={cn("flex h-full w-full flex-col", className)}>
      <div className="relative aspect-[5/3] w-full overflow-hidden border border-current/12 bg-current/[0.04]">
        {inner}
      </div>
      {caption ? (
        <figcaption className="pt-3">
          <MonoLabel className="opacity-50">{caption}</MonoLabel>
        </figcaption>
      ) : null}
    </figure>
  );
}
