/**
 * @file reoptimization-triggers.ts
 * @description Re-optimization trigger taxonomy + anti-windup (IP-06).
 *
 * Pure controllers over a measured time series. Every detector reads the
 * MEDIAN of a finalized window (a low-pass filter) — NEVER today-vs-yesterday —
 * so transient noise can't whip the optimizer back and forth (anti-windup).
 * No I/O, no clock reads, no RNG: time and any "now" come in as parameters, so
 * the cores are deterministic and unit-testable without a DATABASE_URL.
 *
 * [TABLE OF CONTENTS]
 * 1. TYPES & INTERFACES
 * 2. LOCAL CONSTANTS & CONFIG
 * 3. ANTI-WINDUP GUARDS (withinCooldown, inHoldout)
 * 4. CTR CURVE (expectedCtr)
 * 5. TRIGGER EVALUATION (evaluateTriggers)
 * 6. HELPER UTILITIES (median, windows, hash)
 */

// #region 1. Types & Interfaces

/** One finalized daily measurement. `day` is "YYYY-MM-DD"; series is chronological ascending. */
export interface SeriesPoint {
  day: string;
  position?: number;
  impressions?: number;
  ctr?: number;
}

export type TriggerKind = "SLIP" | "PLATEAU" | "CTR_GAP" | "DECAY";

export interface Trigger {
  kind: TriggerKind;
  /** Short human-readable string carrying the numbers behind the decision. */
  detail: string;
}

// #endregion

// #region 2. Local Constants & Config

/** Default share of pages held out of automation as a control group. */
const DEFAULT_HOLDOUT_FRACTION = 0.1;

/** SLIP fires when the recent-7 median rank is this many positions worse than prior-7. */
const SLIP_RANK_DELTA = 3;

/** DECAY fires when impressions fall by at least this fraction at flat rank. */
const DECAY_DROP_FRACTION = 0.3;

/** A rank window must be this many points to form a 7-day SLIP comparison. */
const SHORT_WINDOW = 7;

/** Preferred DECAY window; we fall back to split-in-half when fewer points exist. */
const DECAY_WINDOW = 28;

/** Minimum points per half for the fallback DECAY comparison. */
const DECAY_MIN_HALF = 8;

/** "Flat rank" tolerance: medians within this many positions count as unchanged. */
const FLAT_RANK_EPSILON = 1;

/** Page-2 band: a plateau sits here once rank stops moving. */
const PAGE2_LOW = 11;
const PAGE2_HIGH = 20;

/** CTR_GAP fires when observed ctr is below this multiple of the expected curve. */
const CTR_GAP_RATIO = 0.5;

/** expectedCtr clamp ceiling; floor is an arbitrarily small positive epsilon. */
const CTR_CEILING = 0.4;
const CTR_FLOOR = 1e-6;

// FNV-1a 32-bit constants.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// #endregion

// #region 3. Anti-windup Guards

/** True iff a cooldown is active: `cooldownUntil` is set AND `now` is earlier than it. */
export function withinCooldown(cooldownUntil: Date | null | undefined, now: Date): boolean {
  if (!cooldownUntil) return false;
  return now.getTime() < cooldownUntil.getTime();
}

/**
 * Deterministic holdout assignment. Hashes `pageKey` into [0, 1) and returns
 * true when it lands below `fraction`. Same key always yields the same answer,
 * and roughly `fraction` of distinct keys land in the holdout.
 */
export function inHoldout(pageKey: string, fraction: number = DEFAULT_HOLDOUT_FRACTION): boolean {
  if (fraction <= 0) return false;
  if (fraction >= 1) return true;
  return hash01(pageKey) < fraction;
}

// #endregion

// #region 4. CTR Curve

/**
 * Standard position -> CTR approximation. Monotonically decreasing in position
 * (pos1 > pos2 > pos3), clamped to the (0, 0.4] band. Position 1 ~ 0.30.
 */
export function expectedCtr(position: number): number {
  const p = Math.max(1, position);
  const raw = 0.3 * Math.pow(p, -0.9);
  return Math.min(CTR_CEILING, Math.max(CTR_FLOOR, raw));
}

// #endregion

// #region 5. Trigger Evaluation

/**
 * Evaluate the full re-optimization trigger taxonomy over a finalized series.
 * Each detector compares medians of finalized windows; any window that can't be
 * formed is skipped rather than throwing. Returns zero or more triggers.
 */
export function evaluateTriggers(series: SeriesPoint[], _opts?: { now?: Date }): Trigger[] {
  const triggers: Trigger[] = [];
  if (!Array.isArray(series) || series.length < 2) return triggers;

  const positions = pickField(series, "position");
  const impressions = pickField(series, "impressions");

  // SLIP: recent-7 median rank vs prior-7 median rank (worse = larger number).
  if (positions.length >= SHORT_WINDOW * 2) {
    const recent = lastN(positions, SHORT_WINDOW);
    const prior = lastN(positions.slice(0, positions.length - SHORT_WINDOW), SHORT_WINDOW);
    const rankDelta = median(recent) - median(prior);
    if (rankDelta >= SLIP_RANK_DELTA) {
      triggers.push({
        kind: "SLIP",
        detail: `rank_delta_7d=+${round1(rankDelta)} (>=${SLIP_RANK_DELTA})`,
      });
    }
  }

  // DECAY: impressions down >= 30% at flat rank, over 28-pt windows (or split halves).
  const decay = evaluateDecay(impressions, positions);
  if (decay) triggers.push(decay);

  // PLATEAU: rank flat over the longest available window AND median position on page 2.
  if (positions.length >= 2) {
    const half = Math.floor(positions.length / 2);
    const earlier = positions.slice(0, half);
    const later = positions.slice(positions.length - half);
    const rankDelta = median(later) - median(earlier);
    const cur = median(positions);
    if (Math.abs(rankDelta) < FLAT_RANK_EPSILON && cur >= PAGE2_LOW && cur <= PAGE2_HIGH) {
      triggers.push({
        kind: "PLATEAU",
        detail: `flat rank (delta=${round1(rankDelta)}), median pos=${round1(cur)} on page 2`,
      });
    }
  }

  // CTR_GAP: latest point's ctr below half its expected curve value.
  const latest = lastWith(series, (p) => p.ctr != null && p.position != null);
  if (latest && latest.ctr != null && latest.position != null) {
    const expected = expectedCtr(latest.position);
    if (latest.ctr < CTR_GAP_RATIO * expected) {
      triggers.push({
        kind: "CTR_GAP",
        detail: `ctr=${round3(latest.ctr)} < ${CTR_GAP_RATIO}*expected(${round3(expected)}) at pos ${round1(latest.position)}`,
      });
    }
  }

  return triggers;
}

/** DECAY sub-detector: returns a Trigger or null. Skips when no window can be formed. */
function evaluateDecay(impressions: number[], positions: number[]): Trigger | null {
  let recentImp: number[];
  let priorImp: number[];
  let recentPos: number[];
  let priorPos: number[];

  if (impressions.length >= DECAY_WINDOW * 2) {
    recentImp = lastN(impressions, DECAY_WINDOW);
    priorImp = lastN(impressions.slice(0, impressions.length - DECAY_WINDOW), DECAY_WINDOW);
    recentPos = lastN(positions, DECAY_WINDOW);
    priorPos = lastN(positions.slice(0, Math.max(0, positions.length - DECAY_WINDOW)), DECAY_WINDOW);
  } else {
    const half = Math.floor(impressions.length / 2);
    if (half < DECAY_MIN_HALF) return null;
    priorImp = impressions.slice(0, half);
    recentImp = impressions.slice(impressions.length - half);
    const posHalf = Math.floor(positions.length / 2);
    priorPos = positions.slice(0, posHalf);
    recentPos = positions.slice(positions.length - posHalf);
  }

  const priorMed = median(priorImp);
  if (priorMed <= 0) return null;
  const recentMed = median(recentImp);
  const dropFraction = (priorMed - recentMed) / priorMed;

  const rankFlat = recentPos.length > 0 && priorPos.length > 0
    ? Math.abs(median(recentPos) - median(priorPos)) < FLAT_RANK_EPSILON
    : true;

  if (dropFraction >= DECAY_DROP_FRACTION && rankFlat) {
    return {
      kind: "DECAY",
      detail: `impressions down ${Math.round(dropFraction * 100)}% at flat rank`,
    };
  }
  return null;
}

// #endregion

// #region 6. Helper Utilities

/** Median of a numeric array (ascending sort, average of middle pair when even). Empty -> NaN. */
function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Extract a numeric field from each point that defines it, preserving order. */
function pickField(series: SeriesPoint[], field: "position" | "impressions" | "ctr"): number[] {
  const out: number[] = [];
  for (const p of series) {
    const v = p[field];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Last `n` elements of an array (or fewer if the array is shorter). */
function lastN<T>(arr: T[], n: number): T[] {
  return n >= arr.length ? arr.slice() : arr.slice(arr.length - n);
}

/** Last element satisfying a predicate, or undefined. */
function lastWith(series: SeriesPoint[], pred: (p: SeriesPoint) => boolean): SeriesPoint | undefined {
  for (let i = series.length - 1; i >= 0; i--) {
    if (pred(series[i])) return series[i];
  }
  return undefined;
}

/** FNV-1a 32-bit hash mapped to a stable value in [0, 1). */
function hash01(key: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  // Coerce to unsigned 32-bit, then normalize into [0, 1).
  return (h >>> 0) / 0x1_0000_0000;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

// #endregion
