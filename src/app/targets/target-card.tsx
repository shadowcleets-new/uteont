import type { TargetWithProgress } from "@/lib/services/targets";
import { TARGET_METRICS } from "@/lib/services/targets";
import { projectionConfidence, type TrendPoint } from "@/lib/services/target-history";
import { TargetSparkline } from "@/components/target-sparkline";
import { deleteTargetAction } from "./actions";

const STATUS: Record<string, { bg: string; fg: string; label: string; bar: string }> = {
  hit:         { bg: "#e7efe0", fg: "#4a6b2f", label: "HIT",       bar: "#9bb87a" },
  "on-track":  { bg: "#e7efe0", fg: "#4a6b2f", label: "ON TRACK",  bar: "#9bb87a" },
  "at-risk":   { bg: "#f6ecd6", fg: "#8a6516", label: "AT RISK",   bar: "#d9bd7c" },
  "off-track": { bg: "#f6e0db", fg: "#a33b2b", label: "OFF TRACK", bar: "#d98b7c" },
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function fmtDate(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function metricLabel(metric: string): string {
  return TARGET_METRICS.find((m) => m.key === metric)?.label ?? metric;
}

const CONF: Record<string, { bg: string; fg: string; label: string }> = {
  high: { bg: "#e7efe0", fg: "#4a6b2f", label: "HIGH CONFIDENCE" },
  medium: { bg: "#f6ecd6", fg: "#8a6516", label: "MED CONFIDENCE" },
  low: { bg: "#f0eee6", fg: "#9a988e", label: "LOW CONFIDENCE" },
};

function ConfidenceChip({ level }: { level: "low" | "medium" | "high" }) {
  const m = CONF[level] ?? CONF.low;
  return (
    <span
      className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full"
      style={{ background: m.bg, color: m.fg }}
      title="Confidence in the projection — grows with more observations and a steadier pace"
    >
      {m.label}
    </span>
  );
}

export function TargetCard({ t, history = [] }: { t: TargetWithProgress; history?: TrendPoint[] }) {
  const p = t.progress;
  const s = STATUS[p.status] ?? STATUS["off-track"];
  const fillPct = clamp(p.progressPct, 0, 100);
  const onPacePct = clamp(p.daysTotal > 0 ? (p.daysElapsed / p.daysTotal) * 100 : 0, 0, 100);
  const conf = projectionConfidence(history);
  const band = Math.round(conf.paceStdDev * Math.max(0, p.daysRemaining));

  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#141413] truncate">{t.title}</h3>
          <p className="text-[12px] text-[#6b6a64] mt-0.5">
            <b className="text-[#141413]">{t.current}</b> / {t.goalValue} · {metricLabel(t.metric)}
          </p>
        </div>
        <span
          className="shrink-0 text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full"
          style={{ background: s.bg, color: s.fg }}
        >
          {s.label}
        </span>
      </div>

      {/* Progress vector: fill = where you are; tick = where the required pace says you should be now */}
      <div className="mt-4 relative">
        <div className="h-2.5 rounded-full bg-[#f0eee6] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: s.bar }} />
        </div>
        <div
          className="absolute top-0 h-2.5 w-[2px] bg-[#141413]/55"
          style={{ left: `calc(${onPacePct}% - 1px)` }}
          title="Required-pace marker — where you should be by now"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#6b6a64]">
        <span><b className="text-[#141413]">{Math.round(p.progressPct)}%</b> of goal</span>
        <span>ETA <b className="text-[#141413]">{fmtDate(p.etaMs)}</b></span>
        <span><b className="text-[#141413]">{Math.max(0, Math.round(p.daysRemaining))}</b> days left</span>
        <span>projected <b className="text-[#141413]">{Math.round(p.projectedAtDeadline)}</b>{band > 0 ? ` ±${band}` : ""}</span>
        <span>pace <b className="text-[#141413]">{p.actualPerDay.toFixed(2)}</b>/day vs {p.requiredPerDay.toFixed(2)} needed</span>
      </div>

      <div className="mt-4 pt-3 border-t border-[#f3f1ea] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">TRAJECTORY</span>
          <ConfidenceChip level={conf.level} />
        </div>
        <TargetSparkline points={history} />
      </div>

      <form action={deleteTargetAction} className="mt-3">
        <input type="hidden" name="id" value={t.id} />
        <button type="submit" className="text-[11px] text-[#9a988e] hover:text-[#a33b2b] transition-colors">
          Delete
        </button>
      </form>
    </div>
  );
}
