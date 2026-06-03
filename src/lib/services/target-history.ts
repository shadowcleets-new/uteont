/**
 * Pure trajectory helpers for the Target Control Panel.
 *
 * `summarizeTrend` turns observed snapshots into a direction / pace / plateau
 * read; `sparkPath` turns the values into an SVG polyline. Both are pure so the
 * UI stays a thin renderer.
 */

const DAY = 86_400_000;

export interface TrendPoint {
  value: number;
  capturedAt: number | Date;
}

export interface TrendSummary {
  /** false until we have at least two observations. */
  enough: boolean;
  direction: "up" | "down" | "flat";
  /** last - first across the observed window. */
  delta: number;
  /** observed change per day across the window. */
  perDay: number;
  /** the last few observations show no movement (stalled). */
  plateau: boolean;
  first: number;
  last: number;
  points: number;
}

const ms = (t: number | Date): number => (t instanceof Date ? t.getTime() : t);

export function summarizeTrend(input: TrendPoint[]): TrendSummary {
  const pts = input
    .map((p) => ({ value: p.value, t: ms(p.capturedAt) }))
    .sort((a, b) => a.t - b.t);

  if (pts.length < 2) {
    const only = pts[0]?.value ?? 0;
    return { enough: false, direction: "flat", delta: 0, perDay: 0, plateau: false, first: only, last: only, points: pts.length };
  }

  const first = pts[0];
  const last = pts[pts.length - 1];
  const delta = last.value - first.value;
  const spanDays = (last.t - first.t) / DAY;
  const perDay = spanDays > 0 ? delta / spanDays : 0;
  const eps = 1e-9;
  const direction: TrendSummary["direction"] = delta > eps ? "up" : delta < -eps ? "down" : "flat";

  // Plateau: the most recent 3 observations sit within epsilon of each other.
  let plateau = false;
  if (pts.length >= 3) {
    const tail = pts.slice(-3).map((p) => p.value);
    plateau = Math.max(...tail) - Math.min(...tail) <= eps;
  }

  return { enough: true, direction, delta, perDay, plateau, first: first.value, last: last.value, points: pts.length };
}

export interface Confidence {
  level: "low" | "medium" | "high";
  /** number of observations behind the projection. */
  samples: number;
  /** 0..1 — how steady the per-day pace has been (1 = perfectly steady). */
  stability: number;
  /** standard deviation of the per-day pace, for a ± band on the projection. */
  paceStdDev: number;
}

/**
 * Honest confidence in the trajectory's projection: more observations + a
 * steadier per-day pace = higher confidence. Returns "low" until there are
 * enough points to mean anything. `paceStdDev` lets the UI draw a ± band on the
 * projected-at-deadline value.
 */
export function projectionConfidence(input: TrendPoint[]): Confidence {
  const pts = input.map((p) => ({ v: p.value, t: ms(p.capturedAt) })).sort((a, b) => a.t - b.t);
  const samples = pts.length;
  if (samples < 3) return { level: "low", samples, stability: 0, paceStdDev: 0 };

  const paces: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dtDays = (pts[i].t - pts[i - 1].t) / DAY;
    if (dtDays > 0) paces.push((pts[i].v - pts[i - 1].v) / dtDays);
  }
  if (paces.length === 0) return { level: "low", samples, stability: 0, paceStdDev: 0 };

  const mean = paces.reduce((a, b) => a + b, 0) / paces.length;
  const variance = paces.reduce((a, b) => a + (b - mean) ** 2, 0) / paces.length;
  const sd = Math.sqrt(variance);
  // Coefficient of variation → stability in 0..1 (steadier pace ⇒ closer to 1).
  const cv = Math.abs(mean) > 1e-9 ? sd / Math.abs(mean) : sd > 1e-9 ? Infinity : 0;
  const stability = 1 / (1 + cv);

  let level: Confidence["level"] = "low";
  if (samples >= 5 && stability >= 0.6) level = "high";
  else if (samples >= 3 && stability >= 0.35) level = "medium";

  return { level, samples, stability: Math.round(stability * 100) / 100, paceStdDev: Math.round(sd * 100) / 100 };
}

export interface Regression {
  /** value units per day */
  slopePerDay: number;
  /** fitted value at the first observation's timestamp */
  intercept: number;
  /** epoch ms of the first observation (the x origin) */
  firstMs: number;
  /** 0..1 coefficient of determination (goodness of fit) */
  r2: number;
  /** residual standard deviation, in value units — the projection band unit */
  residualSd: number;
  n: number;
}

/**
 * Ordinary least-squares fit over the snapshot series (x in days from the first
 * observation). This is the spec's regression-based projection: the fitted
 * slope drives projected-at-deadline and R² drives the confidence tier — unlike
 * a naive baseline→current average, it reflects RECENT velocity and how noisy
 * the trajectory is. Pure + fully unit-testable. Returns null with < 2 points.
 */
export function linearRegression(input: TrendPoint[]): Regression | null {
  const pts = input.map((p) => ({ x: ms(p.capturedAt), y: p.value })).sort((a, b) => a.x - b.x);
  const n = pts.length;
  if (n < 2) return null;

  const firstMs = pts[0].x;
  const xs = pts.map((p) => (p.x - firstMs) / DAY);
  const ys = pts.map((p) => p.y);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slopePerDay = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slopePerDay * meanX;

  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slopePerDay * xs[i];
    ssRes += (ys[i] - pred) ** 2;
  }
  const r2 = syy > 0 ? Math.max(0, 1 - ssRes / syy) : 1;
  const residualSd = Math.sqrt(ssRes / Math.max(1, n - 2));

  return { slopePerDay, intercept, firstMs, r2, residualSd, n };
}

/** Project the fitted line to an absolute timestamp. */
export function projectRegression(reg: Regression, atMs: number): number {
  return reg.intercept + reg.slopePerDay * ((atMs - reg.firstMs) / DAY);
}

/**
 * Confidence tier from the regression fit, per the spec: High needs a strong
 * fit (R² ≥ 0.8) and enough points; Medium a moderate fit; otherwise Low.
 */
export function regressionConfidenceLevel(reg: Regression | null): "low" | "medium" | "high" {
  if (!reg || reg.n < 3) return "low";
  if (reg.r2 >= 0.8 && reg.n >= 5) return "high";
  if (reg.r2 >= 0.5 && reg.n >= 3) return "medium";
  return "low";
}

/**
 * SVG polyline `d` attribute for a sparkline. x spreads evenly across `width`;
 * y maps min→bottom, max→top (SVG y grows downward) within `height`, padded so
 * the stroke isn't clipped. Returns "" for no data; a flat mid-line for one point.
 */
export function sparkPath(values: number[], width = 120, height = 28): string {
  if (values.length === 0) return "";
  if (values.length === 1) {
    const y = (height / 2).toFixed(1);
    return `M0.0,${y} L${width.toFixed(1)},${y}`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 1;
  const usableH = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = pad + (1 - (v - min) / span) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M${pts[0]} L${pts.slice(1).join(" L")}`;
}
