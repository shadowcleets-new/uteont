import { sparkPath, summarizeTrend, type TrendPoint } from "@/lib/services/target-history";

const TREND: Record<string, { color: string; glyph: string }> = {
  up: { color: "#788c5d", glyph: "▲" },
  down: { color: "#a33b2b", glyph: "▼" },
  flat: { color: "#9a988e", glyph: "→" },
};

const ms = (t: number | Date): number => (t instanceof Date ? t.getTime() : t);
const fmt = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 10) / 10}`;

/**
 * Trajectory sparkline from observed snapshots: a polyline coloured by overall
 * direction, the net delta, and a PLATEAU flag when the tail has stalled.
 * Renders a "collecting…" hint until there are at least two observations.
 */
export function TargetSparkline({
  points,
  width = 132,
  height = 30,
}: {
  points: TrendPoint[];
  width?: number;
  height?: number;
}) {
  const trend = summarizeTrend(points);
  if (!trend.enough) {
    return <span className="text-[11px] text-[#9a988e] italic">collecting history…</span>;
  }
  const values = [...points].sort((a, b) => ms(a.capturedAt) - ms(b.capturedAt)).map((p) => p.value);
  const d = sparkPath(values, width, height);
  const tr = TREND[trend.direction];

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        <path d={d} fill="none" stroke={tr.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="text-[11px] font-medium tabular-nums" style={{ color: tr.color }}>
        {tr.glyph} {fmt(trend.delta)}
      </span>
      {trend.plateau && (
        <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#f6ecd6] text-[#8a6516]">
          PLATEAU
        </span>
      )}
    </div>
  );
}
