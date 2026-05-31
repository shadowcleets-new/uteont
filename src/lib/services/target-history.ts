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
