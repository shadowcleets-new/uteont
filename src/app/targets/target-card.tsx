import type { TargetWithProgress } from "@/lib/services/targets";
import { TARGET_METRICS } from "@/lib/services/targets";
import { linearRegression, projectRegression, regressionConfidenceLevel, type TrendPoint } from "@/lib/services/target-history";
import type { Intervention } from "@/lib/services/run-interventions";
import { computeCounterfactual } from "@/lib/services/counterfactuals";
import { TargetSparkline } from "@/components/target-sparkline";
import { TrajectoryChart } from "@/components/target-trajectory";
import { deleteTargetAction, updateTargetAction, setTargetStatusAction, updateManualCurrentAction } from "./actions";

const DAY = 86_400_000;

const editCls = "w-full rounded border border-[#e0ddd2] bg-white px-2 py-1 text-[12px] mt-0.5";

function toDateInput(d: unknown): string {
  const t = new Date(d as string).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
}

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

export function TargetCard({ t, history = [], interventions = [] }: { t: TargetWithProgress; history?: TrendPoint[]; interventions?: Intervention[] }) {
  const p = t.progress;
  const s = STATUS[p.status] ?? STATUS["off-track"];
  const fillPct = clamp(p.progressPct, 0, 100);
  const onPacePct = clamp(p.daysTotal > 0 ? (p.daysElapsed / p.daysTotal) * 100 : 0, 0, 100);

  // Regression-based projection over the snapshot history (spec keystone): the
  // fitted slope drives the projected-at-deadline value, R² drives confidence,
  // and the residual spread sets the cone's ± band at the deadline.
  const reg = linearRegression(history);
  const confLevel = regressionConfidenceLevel(reg);
  const direction: "increase" | "decrease" = t.goalValue >= t.baselineValue ? "increase" : "decrease";
  const deadlineMs = new Date(t.deadlineAt as unknown as string).getTime();
  const hasAxis = Number.isFinite(deadlineMs) && p.daysTotal > 0;
  const startMs = deadlineMs - p.daysTotal * DAY;
  const nowMs = startMs + p.daysElapsed * DAY;
  const projected = reg ? projectRegression(reg, deadlineMs) : p.projectedAtDeadline;
  const band = reg ? Math.round(reg.residualSd * Math.sqrt(Math.max(1, p.daysRemaining))) : 0;

  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#141413] truncate">{t.title}</h3>
          <p className="text-[12px] text-[#6b6a64] mt-0.5">
            <b className="text-[#141413]">{t.current}</b> / {t.goalValue} · {metricLabel(t.metric)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {t.status !== "active" && (
            <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#f0eee6] text-[#9a988e]">
              {String(t.status).toUpperCase()}
            </span>
          )}
          <span
            className="text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full"
            style={{ background: s.bg, color: s.fg }}
          >
            {s.label}
          </span>
        </div>
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
        <span>projected <b className="text-[#141413]">{Math.round(projected)}</b>{band > 0 ? ` ±${band}` : ""}</span>
        <span>pace <b className="text-[#141413]">{p.actualPerDay.toFixed(2)}</b>/day vs {p.requiredPerDay.toFixed(2)} needed</span>
      </div>

      <div className="mt-4 pt-3 border-t border-[#f3f1ea]">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">TRAJECTORY</span>
            <ConfidenceChip level={confLevel} />
          </div>
          <TargetSparkline points={history} />
        </div>
        {hasAxis && (
          <TrajectoryChart
            history={history}
            baseline={t.baselineValue}
            goal={t.goalValue}
            startMs={startMs}
            deadlineMs={deadlineMs}
            nowMs={nowMs}
            projected={projected}
            bandAtDeadline={band}
            direction={direction}
            interventions={interventions.filter((iv) => iv.atMs >= startMs && iv.atMs <= deadlineMs)}
            counterfactual={computeCounterfactual({
              history,
              interventions,
              baseline: t.baselineValue,
              startMs,
              deadlineMs,
            })}
          />
        )}
      </div>

      {t.metric === "manual" && (
        <form action={updateManualCurrentAction} className="mt-3 flex items-center gap-2">
          <input type="hidden" name="id" value={t.id} />
          <span className="text-[11px] text-[#6b6a64]">Log current value:</span>
          <input name="manualCurrent" type="number" step="any" defaultValue={t.current} className="w-24 rounded border border-[#e0ddd2] bg-white px-2 py-1 text-[12px]" />
          <button type="submit" className="text-[11px] text-[#d97757] hover:underline">Save</button>
        </form>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] text-[#6b6a64] hover:text-[#141413] select-none">Edit details</summary>
        <form action={updateTargetAction} className="mt-2 grid grid-cols-2 gap-2 rounded-[8px] bg-[#faf9f5] border border-[#f0eee6] p-3">
          <input type="hidden" name="id" value={t.id} />
          <label className="col-span-2 text-[10px] text-[#6b6a64]">Objective
            <input name="title" defaultValue={t.title} className={editCls} />
          </label>
          <label className="text-[10px] text-[#6b6a64]">Baseline
            <input name="baselineValue" type="number" step="any" defaultValue={t.baselineValue} className={editCls} />
          </label>
          <label className="text-[10px] text-[#6b6a64]">Goal
            <input name="goalValue" type="number" step="any" defaultValue={t.goalValue} className={editCls} />
          </label>
          <label className="col-span-2 text-[10px] text-[#6b6a64]">Deadline
            <input name="deadlineAt" type="date" defaultValue={toDateInput(t.deadlineAt)} className={editCls} />
          </label>
          <button type="submit" className="col-span-2 mt-1 rounded-md bg-[#d97757] text-white px-3 py-1.5 text-[12px] font-medium hover:bg-[#c86846]">
            Save changes
          </button>
        </form>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {t.status === "paused" ? (
          <StatusButton id={t.id} status="active" label="Resume" />
        ) : (
          <StatusButton id={t.id} status="paused" label="Pause" />
        )}
        {t.status !== "archived" && <StatusButton id={t.id} status="archived" label="Archive" />}
        <form action={deleteTargetAction} className="inline">
          <input type="hidden" name="id" value={t.id} />
          <button type="submit" className="text-[#9a988e] hover:text-[#a33b2b] transition-colors">Delete</button>
        </form>
      </div>
    </div>
  );
}

function StatusButton({ id, status, label }: { id: number; status: string; label: string }) {
  return (
    <form action={setTargetStatusAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className="text-[#6b6a64] hover:text-[#141413] transition-colors">{label}</button>
    </form>
  );
}
