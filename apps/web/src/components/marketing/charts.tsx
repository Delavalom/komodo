import type { LeaderboardSeries } from "@/lib/marketing-types";

import { MonoLabel } from "./ui";

/**
 * Chart panels for /benchmarks and /agent-leaderboard.
 * docs/SPEC-MARKETING.md §M10.2, §M10.3.
 *
 * Plain SVG and flex bars — no chart library, no client JS. Every series is
 * seeded (§M12.3), so nothing here is a measurement.
 */
const SERIES_COLORS = ["#28e99f", "#756cf5", "#ff7f59", "#5882ff"];

export function ChartPanel({ panel }: { panel: LeaderboardSeries }) {
  return (
    <figure className="flex flex-col border border-current/12 p-6">
      <figcaption>
        <MonoLabel className="block opacity-70">{panel.title}</MonoLabel>
        <p className="pt-2 text-xs leading-relaxed opacity-55">{panel.note}</p>
      </figcaption>
      <div className="flex-1 pt-6">
        {panel.kind === "lines" ? (
          <LineChart panel={panel} />
        ) : (
          <BarChart panel={panel} />
        )}
      </div>
      <div className="flex flex-wrap gap-4 pt-4">
        {panel.series.map((s, i) => (
          <span key={s.name} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2"
              style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            <MonoLabel className="text-[10px] opacity-55">{s.name}</MonoLabel>
          </span>
        ))}
      </div>
    </figure>
  );
}

function BarChart({ panel }: { panel: LeaderboardSeries }) {
  const values = panel.series[0]?.values ?? [];
  const max = Math.max(1, ...values);

  return (
    <div className="space-y-3">
      {panel.labels.map((label, i) => (
        <div key={label} className="flex items-center gap-3">
          <MonoLabel className="w-20 shrink-0 text-[10px] opacity-55">
            {label}
          </MonoLabel>
          <span className="h-4 flex-1 bg-current/[0.06]">
            <span
              className="block h-full"
              style={{
                width: `${Math.round(((values[i] ?? 0) / max) * 100)}%`,
                background: SERIES_COLORS[0],
              }}
            />
          </span>
          <MonoLabel className="w-10 shrink-0 text-right text-[10px] opacity-70">
            {values[i] ?? 0}
          </MonoLabel>
        </div>
      ))}
    </div>
  );
}

function LineChart({ panel }: { panel: LeaderboardSeries }) {
  const all = panel.series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const w = 320;
  const h = 140;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" aria-hidden>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1="0"
            x2={w}
            y1={t * h}
            y2={t * h}
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.12"
          />
        ))}
        {panel.series.map((s, si) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
            strokeWidth="2"
            points={s.values
              .map((v, i) => {
                const x = (i / Math.max(1, s.values.length - 1)) * w;
                const y = h - (v / max) * (h - 8) - 4;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ")}
          />
        ))}
      </svg>
      <div className="flex justify-between pt-2">
        {panel.labels.map((label) => (
          <MonoLabel key={label} className="text-[10px] opacity-45">
            {label}
          </MonoLabel>
        ))}
      </div>
    </div>
  );
}

/** The bug-catch table on /benchmarks. §M10.2 */
export function BenchmarkTable({
  rows,
}: {
  rows: {
    tool: string;
    caught: number;
    falsePositives: number;
    medianComments: number;
    isGreptile: boolean;
  }[];
}) {
  const max = Math.max(...rows.map((r) => r.caught));

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-current/20">
          {["Tool", "Defects caught", "False positives", "Median comments"].map(
            (head) => (
              <th key={head} className="py-3 pr-6">
                <MonoLabel className="opacity-55">{head}</MonoLabel>
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.tool} className="border-b border-current/10">
            <td className="py-4 pr-6 text-sm font-medium">
              {row.tool}
              {row.isGreptile ? (
                <MonoLabel className="ml-2 bg-mkt-green px-1.5 py-0.5 text-[9px] text-mkt-basalt">
                  ours
                </MonoLabel>
              ) : null}
            </td>
            <td className="py-4 pr-6">
              <span className="flex items-center gap-3">
                <span className="h-3 w-32 bg-current/[0.06]">
                  <span
                    className="block h-full"
                    style={{
                      width: `${Math.round((row.caught / max) * 100)}%`,
                      background: row.isGreptile ? "#28e99f" : "#756cf5",
                    }}
                  />
                </span>
                <MonoLabel className="opacity-70">{row.caught}%</MonoLabel>
              </span>
            </td>
            <td className="py-4 pr-6 text-sm opacity-75">
              {row.falsePositives}%
            </td>
            <td className="py-4 text-sm opacity-75">{row.medianComments}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
