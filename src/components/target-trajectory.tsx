import type { TrendPoint } from "@/lib/services/target-history";

const ms = (t: number | Date): number => (t instanceof Date ? t.getTime() : t);

export interface Intervention {
  atMs: number;
  label?: string;
}

/**
 * The Target Control Panel's keystone: a projection "cone". On one shared time
 * axis (start → deadline) it draws
 *   - the required-slope line (baseline → goal), dashed grey,
 *   - the observed snapshot line (real data so far),
 *   - the regression projection from the last observation to the deadline,
 *   - a translucent cone whose half-width grows to ±band at the deadline
 *     (wider = less confident),
 *   - a "now" marker and intervention/observation ticks.
 * Pure SVG — all inputs are numbers, so it renders deterministically on the
 * server with no hydration concerns.
 */
export function TrajectoryChart({
  history,
  baseline,
  goal,
  startMs,
  deadlineMs,
  nowMs,
  projected,
  bandAtDeadline,
  direction,
  interventions = [],
  width = 460,
  height = 120,
}: {
  history: TrendPoint[];
  baseline: number;
  goal: number;
  startMs: number;
  deadlineMs: number;
  nowMs: number;
  projected: number;
  bandAtDeadline: number;
  direction: "increase" | "decrease";
  interventions?: Intervention[];
  width?: number;
  height?: number;
}) {
  const padL = 6, padR = 6, padT = 10, padB = 14;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const span = Math.max(1, deadlineMs - startMs);

  const obs = [...history].map((p) => ({ t: ms(p.capturedAt), v: p.value })).sort((a, b) => a.t - b.t);
  const dirColor = direction === "increase" ? "#788c5d" : "#a33b2b";

  // y-domain spans every series so nothing clips.
  const ysAll = [baseline, goal, projected, projected + bandAtDeadline, projected - bandAtDeadline, ...obs.map((o) => o.v)];
  let yMin = Math.min(...ysAll);
  let yMax = Math.max(...ysAll);
  const padY = (yMax - yMin || Math.abs(yMax) || 1) * 0.08;
  yMin -= padY;
  yMax += padY;

  const x = (t: number) => padL + (Math.max(0, Math.min(span, t - startMs)) / span) * plotW;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const last = obs[obs.length - 1];
  const enoughForProjection = obs.length >= 2 && deadlineMs > nowMs;

  // Cone: from the last observation, widening to ±band at the deadline.
  let cone = "";
  if (enoughForProjection && bandAtDeadline > 0 && last) {
    cone = [
      `M ${x(last.t).toFixed(1)},${y(last.v).toFixed(1)}`,
      `L ${x(deadlineMs).toFixed(1)},${y(projected + bandAtDeadline).toFixed(1)}`,
      `L ${x(deadlineMs).toFixed(1)},${y(projected - bandAtDeadline).toFixed(1)}`,
      "Z",
    ].join(" ");
  }

  const obsPath = obs.length
    ? `M ${obs.map((o) => `${x(o.t).toFixed(1)},${y(o.v).toFixed(1)}`).join(" L ")}`
    : "";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="max-w-full" role="img" aria-label="Target trajectory projection">
      {/* required-slope line: baseline at start → goal at deadline */}
      <line
        x1={x(startMs)} y1={y(baseline)} x2={x(deadlineMs)} y2={y(goal)}
        stroke="#cfccc1" strokeWidth="1.5" strokeDasharray="4 3"
      />
      {/* goal marker */}
      <circle cx={x(deadlineMs)} cy={y(goal)} r="2.5" fill="#9a988e" />

      {/* confidence cone */}
      {cone && <path d={cone} fill={dirColor} fillOpacity="0.12" stroke="none" />}

      {/* projection centerline (last obs → projected@deadline) */}
      {enoughForProjection && last && (
        <line
          x1={x(last.t)} y1={y(last.v)} x2={x(deadlineMs)} y2={y(projected)}
          stroke={dirColor} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.8"
        />
      )}

      {/* observed line + dots */}
      {obsPath && <path d={obsPath} fill="none" stroke={dirColor} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />}
      {obs.map((o, i) => (
        <circle key={i} cx={x(o.t)} cy={y(o.v)} r="1.8" fill={dirColor} />
      ))}

      {/* now marker */}
      <line x1={x(nowMs)} y1={padT - 4} x2={x(nowMs)} y2={height - padB + 2} stroke="#141413" strokeOpacity="0.35" strokeWidth="1" />
      <text x={x(nowMs)} y={height - 3} textAnchor="middle" fontSize="8" fill="#9a988e">now</text>

      {/* intervention ticks (operator actions / observations) */}
      {interventions.map((iv, i) => (
        <line key={`iv${i}`} x1={x(iv.atMs)} y1={height - padB - 2} x2={x(iv.atMs)} y2={height - padB + 4} stroke="#d97757" strokeWidth="1.5">
          {iv.label && <title>{iv.label}</title>}
        </line>
      ))}
    </svg>
  );
}
