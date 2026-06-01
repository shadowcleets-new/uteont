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
