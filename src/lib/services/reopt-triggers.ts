/**
 * @file reopt-triggers.ts
 * @description Re-optimization trigger detection (plan §C.4). Pure, deterministic
 *   logic: decide whether a target's live trajectory warrants another optimization
 *   pass, while respecting a cooldown window and a deterministic A/B holdout.
 *
 *   Design notes:
 *   - LOW-PASS by construction: every signal compares a MEDIAN over a window
 *     against a MEDIAN over an earlier window. We never compare today vs.
 *     yesterday — single-day noise must not flip a trigger.
 *   - No DB / no network / no real clock or RNG: `now` is injected, and the
 *     holdout uses a deterministic hash of a caller-supplied key.
 *
 * [TABLE OF CONTENTS]
 * 1. IMPORTS & DEPENDENCIES        (none — stdlib only)
 * 2. PUBLIC TYPES & INTERFACES
 * 3. LOCAL CONSTANTS & CONFIG
 * 4. PUBLIC API — pure utilities   (median, withinCooldown, inHoldout, expectedCtr)
 * 5. PUBLIC API — detectTriggers
 * 6. HELPER UTILITIES              (window slicing, individual detectors)
 */

// #region 2. Public Types & Interfaces

/** One day of search-performance data. Series is ASCENDING by day; last = today (d-0). */
export interface DayPoint {
  day: string;
  position?: number;
  impressions?: number;
  ctr?: number;
}

export type TriggerKind = "SLIP" | "PLATEAU" | "CTR_GAP" | "DECAY";

export interface Trigger {
  kind: TriggerKind;
  detail: string;
}

// #endregion

// #region 3. Local Constants & Config

/** Expected organic CTR by integer SERP position (plan §C.4). >10 falls back to 0.01. */
const EXPECTED_CTR_TABLE: Readonly<Record<number, number>> = {
  1: 0.28,
  2: 0.15,
  3: 0.1,
  4: 0.07,
  5: 0.05,
  6: 0.04,
  7: 0.03,
  8: 0.025,
  9: 0.02,
  10: 0.018,
};
const EXPECTED_CTR_FALLBACK = 0.01;

const DEFAULT_HOLDOUT_PCT = 0.1;

// FNV-1a 32-bit constants.
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// #endregion

// #region 4. Public API — pure utilities

/**
 * Median of a numeric list. Non-finite values are filtered out defensively.
 * Returns 0 for an empty (or all-non-finite) list so callers never see NaN.
 */
export function median(xs: number[]): number {
  if (!Array.isArray(xs) || xs.length === 0) return 0;
  const clean = xs.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (clean.length === 0) return 0;
  const sorted = [...clean].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** True iff a cooldown is set and ends strictly after `now`. */
export function withinCooldown(
  cooldownUntil: Date | null | undefined,
  now: Date,
): boolean {
  if (cooldownUntil == null) return false;
  const until = cooldownUntil.getTime();
  if (!Number.isFinite(until)) return false;
  return until > now.getTime();
}

/**
 * Deterministic A/B holdout membership. Hashes `key` (FNV-1a) into a stable
 * fraction in [0,1) and returns true when that fraction is below `pct`. Same key
 * always yields the same answer; pct=1 => always true, pct=0 => always false.
 */
export function inHoldout(key: string, pct: number = DEFAULT_HOLDOUT_PCT): boolean {
  const p = typeof pct === "number" && Number.isFinite(pct) ? pct : DEFAULT_HOLDOUT_PCT;
  if (p <= 0) return false;
  if (p >= 1) return true;
  const safeKey = typeof key === "string" ? key : String(key ?? "");
  const fraction = (fnv1a(safeKey) % 1000) / 1000;
  return fraction < p;
}

/** Expected CTR for a SERP position. Rounds to nearest int; clamps <1 to 1. */
export function expectedCtr(position: number): number {
  if (typeof position !== "number" || !Number.isFinite(position)) {
    return EXPECTED_CTR_FALLBACK;
  }
  let pos = Math.round(position);
  if (pos < 1) pos = 1;
  return EXPECTED_CTR_TABLE[pos] ?? EXPECTED_CTR_FALLBACK;
}

// #endregion

// #region 5. Public API — detectTriggers

/**
 * Inspect an ascending day series and return every re-optimization trigger that
 * fires. Every detector is low-pass (median over windows). A flat/healthy series
 * returns []. `now` is accepted for symmetry with cooldown logic but the
 * detectors derive recency from array order, not the wall clock.
 */
export function detectTriggers(series: DayPoint[], _now: Date = new Date()): Trigger[] {
  if (!Array.isArray(series) || series.length < 2) return [];

  const out: Trigger[] = [];
  const slip = detectSlip(series);
  if (slip) out.push(slip);
  const decay = detectDecay(series);
  if (decay) out.push(decay);
  const plateau = detectPlateau(series);
  if (plateau) out.push(plateau);
  const ctrGap = detectCtrGap(series);
  if (ctrGap) out.push(ctrGap);
  return out;
}

// #endregion

// #region 6. Helper Utilities

/** FNV-1a 32-bit hash -> unsigned int. Deterministic across runs/platforms. */
function fnv1a(str: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i) & 0xff;
    // Multiply by FNV prime, keep 32-bit unsigned via Math.imul + >>>.
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Extract a numeric field over a window, dropping points where it is absent. */
function pick(series: DayPoint[], from: number, to: number, field: keyof DayPoint): number[] {
  const out: number[] = [];
  for (let i = from; i <= to && i < series.length; i++) {
    if (i < 0) continue;
    const v = series[i]?.[field];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * SLIP — needs >= 14 positions. Compare the last 7 days (recent) against the 7
 * days before them (older). slip = median(recent) - median(older).
 *
 * NOTE ON SIGN: a HIGHER position number means a WORSE rank. The plan text reads
 * "slip = median(recent) - median(older) ... fire iff slip >= 3", which is the
 * worsening sense (recent rank number grew). We implement that worsening sense
 * directly; this comment flags that the literal arithmetic in the plan already
 * encodes "rank got worse by >= 3", so no inversion is applied here.
 */
function detectSlip(series: DayPoint[]): Trigger | null {
  const n = series.length;
  const recent = pick(series, n - 7, n - 1, "position");
  const older = pick(series, n - 14, n - 8, "position");
  if (recent.length < 7 || older.length < 7) return null;
  const slip = median(recent) - median(older);
  if (slip >= 3) {
    return {
      kind: "SLIP",
      detail: `Rank worsened by ${slip.toFixed(1)} (median ${median(older).toFixed(1)} -> ${median(recent).toFixed(1)}) over the last 7 days.`,
    };
  }
  return null;
}

/**
 * DECAY — needs >= 56 points (2 x 28 windows) of impressions. Fire when recent
 * 28-day median impressions <= 70% of the prior 28-day median AND rank stayed
 * flat (|median(last28 pos) - median(prior28 pos)| < 1).
 */
function detectDecay(series: DayPoint[]): Trigger | null {
  const n = series.length;
  if (n < 56) return null;
  const recentImp = pick(series, n - 28, n - 1, "impressions");
  const priorImp = pick(series, n - 56, n - 29, "impressions");
  if (recentImp.length < 28 || priorImp.length < 28) return null;

  const recMed = median(recentImp);
  const priMed = median(priorImp);
  if (priMed <= 0) return null;
  if (recMed > 0.7 * priMed) return null;

  const recentPos = pick(series, n - 28, n - 1, "position");
  const priorPos = pick(series, n - 56, n - 29, "position");
  if (recentPos.length < 28 || priorPos.length < 28) return null;
  const rankDrift = Math.abs(median(recentPos) - median(priorPos));
  if (rankDrift >= 1) return null;

  return {
    kind: "DECAY",
    detail: `Impressions decayed to ${recMed.toFixed(0)} from ${priMed.toFixed(0)} (<=70%) while rank held flat (drift ${rankDrift.toFixed(2)}).`,
  };
}

/**
 * PLATEAU — needs >= 60 points. Fire when the last-60 median position sits on
 * page 2 (in [11,20]) AND rank is flat across the two 28-day windows
 * (|median(last28) - median([n-56..n-28))| < 1).
 */
function detectPlateau(series: DayPoint[]): Trigger | null {
  const n = series.length;
  if (n < 60) return null;
  const last60 = pick(series, n - 60, n - 1, "position");
  if (last60.length < 60) return null;
  const med60 = median(last60);
  if (med60 < 11 || med60 > 20) return null;

  const last28 = pick(series, n - 28, n - 1, "position");
  const prior28 = pick(series, n - 56, n - 29, "position");
  if (last28.length < 28 || prior28.length < 28) return null;
  const drift = Math.abs(median(last28) - median(prior28));
  if (drift >= 1) return null;

  return {
    kind: "PLATEAU",
    detail: `Stuck on page 2 (median position ${med60.toFixed(1)}) with flat movement (drift ${drift.toFixed(2)}).`,
  };
}

/** CTR_GAP — last point only. Fire when ctr < 50% of the expected ctr for its position. */
function detectCtrGap(series: DayPoint[]): Trigger | null {
  const last = series[series.length - 1];
  if (!last) return null;
  const { position, ctr } = last;
  if (typeof position !== "number" || !Number.isFinite(position)) return null;
  if (typeof ctr !== "number" || !Number.isFinite(ctr)) return null;
  const expected = expectedCtr(position);
  if (ctr < 0.5 * expected) {
    return {
      kind: "CTR_GAP",
      detail: `CTR ${(ctr * 100).toFixed(2)}% is below half the expected ${(expected * 100).toFixed(2)}% for position ${Math.round(position)}.`,
    };
  }
  return null;
}

// #endregion
