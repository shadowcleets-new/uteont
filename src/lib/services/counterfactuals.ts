/**
 * @file counterfactuals.ts
 * @description LO-15 — the "what if we'd done nothing" baseline. Estimates where
 * a target metric would have landed at the deadline WITHOUT any agent
 * intervention, by extrapolating the natural drift observed BEFORE the first
 * intervention. Rendered as a dashed ghost line on the trajectory so the
 * operator can see how much the interventions actually moved the needle.
 *
 * Naive by design: a single-slope linear extrapolation of pre-intervention
 * snapshots. With < 2 pre-intervention points there's no drift signal, so the
 * counterfactual is flat at the baseline.
 */

export interface TrendPointLike {
  capturedAt: Date | string | number;
  value: number;
}

export interface CounterfactualInput {
  history: TrendPointLike[];
  interventions: Array<{ atMs: number }>;
  baseline: number;
  startMs: number;
  deadlineMs: number;
}

export interface Counterfactual {
  /** Projected metric value at the deadline if nothing had been done. */
  valueAtDeadline: number;
  /** Anchor the ghost line starts from (start of the window). */
  fromMs: number;
  fromValue: number;
}

function toMs(t: Date | string | number): number {
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  return Date.parse(t);
}

/**
 * Compute the no-intervention counterfactual, or null when there's nothing to
 * compare against (no interventions). Pure + tested.
 */
export function computeCounterfactual(input: CounterfactualInput): Counterfactual | null {
  if (!input.interventions.length) return null;

  const firstIntervention = Math.min(...input.interventions.map((i) => i.atMs));
  const pre = input.history
    .map((p) => ({ t: toMs(p.capturedAt), v: p.value }))
    .filter((p) => Number.isFinite(p.t) && p.t <= firstIntervention)
    .sort((a, b) => a.t - b.t);

  // No drift signal → assume the metric would have held at baseline.
  if (pre.length < 2) {
    return { valueAtDeadline: input.baseline, fromMs: input.startMs, fromValue: input.baseline };
  }

  // Linear slope from the first to the last pre-intervention point.
  const a = pre[0];
  const b = pre[pre.length - 1];
  const dt = b.t - a.t;
  const slopePerMs = dt === 0 ? 0 : (b.v - a.v) / dt;
  const valueAtDeadline = a.v + slopePerMs * (input.deadlineMs - a.t);

  return { valueAtDeadline, fromMs: a.t, fromValue: a.v };
}
