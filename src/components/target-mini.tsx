import type { TargetWithProgress } from "@/lib/services/targets";

const STATUS: Record<string, { bg: string; fg: string; label: string; bar: string }> = {
  hit:         { bg: "#e7efe0", fg: "#4a6b2f", label: "HIT",       bar: "#9bb87a" },
  "on-track":  { bg: "#e7efe0", fg: "#4a6b2f", label: "ON TRACK",  bar: "#9bb87a" },
  "at-risk":   { bg: "#f6ecd6", fg: "#8a6516", label: "AT RISK",   bar: "#d9bd7c" },
  "off-track": { bg: "#f6e0db", fg: "#a33b2b", label: "OFF TRACK", bar: "#d98b7c" },
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Compact one-line target row for dashboard summaries. */
export function TargetMini({ t }: { t: TargetWithProgress }) {
  const p = t.progress;
  const s = STATUS[p.status] ?? STATUS["off-track"];
  const fillPct = clamp(p.progressPct, 0, 100);
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-[#f3f1ea] first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[#141413] truncate">{t.title}</div>
        <div className="mt-1.5 h-1.5 rounded-full bg-[#f0eee6] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: s.bar }} />
        </div>
      </div>
      <div className="text-[12px] text-[#6b6a64] w-10 text-right shrink-0">{Math.round(p.progressPct)}%</div>
      <span
        className="shrink-0 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full"
        style={{ background: s.bg, color: s.fg }}
      >
        {s.label}
      </span>
    </div>
  );
}
