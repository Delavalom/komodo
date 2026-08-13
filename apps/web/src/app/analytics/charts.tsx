import { cn } from "@/components/ui";

/*
 * Server-rendered charts — no chart library, no client JS.
 *
 * Design constraints applied throughout:
 *  - Marks carry color; every label/value uses a text token, never the data hue.
 *  - Single-series charts get no legend (the card title names the series).
 *  - Severity is a *status* palette. Red (#ef4444) and orange (#f97316) sit only
 *    ΔE 10.4 apart in normal vision, so they are never placed adjacent for the
 *    reader to distinguish by hue: every severity mark is directly labeled and
 *    given its own row. Do not refactor these into a stacked bar.
 *  - Bars cap at 24px, 4px rounded at the data end, square at the baseline.
 *  - Gridlines are hairline and recessive; adjacent marks are separated by a
 *    2px surface gap rather than a stroke.
 */

export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-surface border border-border rounded-xl p-5", className)}>
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      {subtitle && <p className="text-xs text-text-dim mt-0.5">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function NoData({ label = "No data" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-lg text-text-faint">{label}</div>
  );
}

/** Round a max value up to a clean axis tick. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export interface ColumnDatum {
  label: string;
  value: number;
  /** Shown in the native tooltip; falls back to `label`. */
  title?: string;
}

/**
 * Column chart for a single series over time.
 * Values are carried by the y-axis ticks; only the peak is directly labeled.
 */
export function ColumnChart({ data, unit = "" }: { data: ColumnDatum[]; unit?: string }) {
  if (data.length === 0 || data.every((d) => d.value === 0)) return <NoData />;

  const H = 160;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const peak = Math.max(...data.map((d) => d.value));
  const ticks = [0, max / 2, max];

  // Label every Nth column so ticks never collide.
  const labelEvery = Math.ceil(data.length / 8);

  return (
    // The y-axis and the plot+x-axis are siblings in one flex row, so the
    // x labels inherit the plot's exact width and stay aligned to their bars.
    <div className="flex gap-3">
      {/* Y axis */}
      <div
        className="flex flex-col justify-between items-end shrink-0 text-[10px] tabular-nums text-text-faint"
        style={{ height: H }}
      >
        {[...ticks].reverse().map((t) => (
          <span key={t} className="leading-none">
            {t.toLocaleString()}
          </span>
        ))}
      </div>

      <div className="flex-1 min-w-0">
        {/* Plot */}
        <div className="relative" style={{ height: H }}>
          {/* Recessive hairline gridlines */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-border"
              style={{ bottom: `${(t / max) * 100}%` }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d) => {
              const pct = max === 0 ? 0 : (d.value / max) * 100;
              const isPeak = d.value === peak && peak > 0;
              return (
                <div
                  key={d.label}
                  className="flex-1 min-w-0 flex justify-center items-end h-full"
                  title={`${d.title ?? d.label}: ${d.value.toLocaleString()}${unit}`}
                >
                  <div
                    className="w-full bg-accent"
                    style={{
                      maxWidth: 24,
                      height: `${pct}%`,
                      minHeight: d.value > 0 ? 2 : 0,
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                      opacity: isPeak ? 1 : 0.75,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* X axis — same flex geometry as the bars above */}
        <div className="flex gap-[2px] mt-2">
          {data.map((d, i) => (
            <div
              key={d.label}
              className="flex-1 min-w-0 text-center text-[10px] text-text-faint truncate"
            >
              {data.length <= 8 || i % labelEvery === 0 ? d.label : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Mark color. Omit for the default accent hue. */
  color?: string;
}

/**
 * Horizontal bars, one row per item, each directly labeled.
 * Used where identity must not depend on hue (severity) or where labels are
 * long (model names).
 */
export function BarList({ data, unit = "" }: { data: BarDatum[]; unit?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (data.length === 0 || total === 0) return <NoData />;

  const max = Math.max(...data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => {
        const pct = max === 0 ? 0 : (d.value / max) * 100;
        const share = total === 0 ? 0 : Math.round((d.value / total) * 100);
        return (
          <div key={d.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ background: d.color ?? "var(--color-accent)" }}
                  aria-hidden
                />
                <span className="text-[13px] text-text truncate">{d.label}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-text-muted">
                {d.value.toLocaleString()}
                {unit}
                <span className="text-text-faint ml-1.5">{share}%</span>
              </span>
            </div>
            <div className="h-2 rounded-sm bg-surface-2 overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: d.color ?? "var(--color-accent)",
                  borderTopRightRadius: 4,
                  borderBottomRightRadius: 4,
                }}
                title={`${d.label}: ${d.value.toLocaleString()}${unit}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
