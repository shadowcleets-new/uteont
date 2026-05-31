/**
 * Pure trajectory engine for the Target Control Panel (#2).
 *
 * Given an objective (baseline -> goal over a time window) and the current
 * value, it computes the progress vector: how far you've come, the pace you
 * need vs. the pace you're on, where you'll land at the deadline, an ETA, and
 * an on-track / at-risk / off-track verdict. Pure + deterministic so it's fully
 * unit-testable and can run on the server or the client.
 */

export type TargetDirection = "increase" | "decrease";
export type TargetStatus = "hit" | "on-track" | "at-risk" | "off-track";

export interface TargetProgressInput {
  baseline: number;
  goal: number;
  current: number;
  direction: TargetDirection;
  startMs: number;
  deadlineMs: number;
  nowMs: number;
}

export interface TargetProgress {
  /** 0 = at baseline, 100 = at goal (can exceed 100 when surpassed, go negative when regressing). */
  progressPct: number;
  /** Units/day toward the goal needed to hit it by the deadline (from baseline). */
  requiredPerDay: number;
  /** Units/day actually achieved so far. */
  actualPerDay: number;
  /** Extrapolated metric value at the deadline if the current pace holds. */
  projectedAtDeadline: number;
  /** Projected timestamp the goal is reached at the current pace, or null if not progressing. */
  etaMs: number | null;
  status: TargetStatus;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
}

const DAY = 86_400_000;

// Projected fraction of the goal at the deadline above which we call it at-risk
// (rather than off-track). Below 1.0 it can't hit, so anything in [0.75, 1) is
// "close but slipping".
const AT_RISK_FLOOR = 0.75;

export function computeTargetProgress(input: TargetProgressInput): TargetProgress {
  const { baseline, goal, current, direction, startMs, deadlineMs, nowMs } = input;

  // Normalize so "toward the goal" is always the positive direction.
  const sign = direction === "increase" ? 1 : -1;
  const span = (goal - baseline) * sign; // > 0 when the goal sits on the intended side
  const movement = (current - baseline) * sign; // distance covered toward the goal

  const daysTotal = Math.max(0, (deadlineMs - startMs) / DAY);
  const daysElapsed = Math.max(0, (nowMs - startMs) / DAY);
  const daysRemaining = (deadlineMs - nowMs) / DAY;

  const progressFraction = span > 0 ? movement / span : movement >= 0 ? 1 : 0;
  const progressPct = progressFraction * 100;

  const requiredPerDay = daysTotal > 0 ? span / daysTotal : 0;
  const actualPerDay = daysElapsed > 0 ? movement / daysElapsed : 0;

  const projectedMovement = actualPerDay * daysTotal;
  const projectedAtDeadline = baseline + sign * projectedMovement;

  let etaMs: number | null = null;
  if (actualPerDay > 0 && span > 0) {
    etaMs = startMs + (span / actualPerDay) * DAY;
  }

  let status: TargetStatus;
  if (progressFraction >= 1) {
    status = "hit";
  } else {
    const projectedFraction = span > 0 ? projectedMovement / span : 0;
    if (projectedFraction >= 1) status = "on-track";
    else if (projectedFraction >= AT_RISK_FLOOR) status = "at-risk";
    else status = "off-track";
  }

  return {
    progressPct,
    requiredPerDay,
    actualPerDay,
    projectedAtDeadline,
    etaMs,
    status,
    daysElapsed,
    daysTotal,
    daysRemaining,
  };
}
