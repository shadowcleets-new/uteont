/**
 * Google Analytics 4 (Data API) integration.
 *
 * Reuses the same Google OAuth refresh token as Search Console (the consent now
 * requests the analytics.readonly scope too), plus the site's numeric GA4
 * property id. Pure helpers (report body, response summary) are unit-tested;
 * the network calls are defensive (null on failure) so callers degrade.
 */

import { refreshAccessToken, type DateRange } from "./gsc";

export interface Ga4Summary {
  sessions: number;
  totalUsers: number;
  conversions: number;
  engagementRate: number;
}

export interface Ga4Config {
  refreshToken: string;
  propertyId: string; // numeric GA4 property id
}

// Order matters — responses are parsed positionally against this list.
export const GA4_METRICS = ["sessions", "totalUsers", "conversions", "engagementRate"] as const;

export function ga4ReportBody(range: DateRange): Record<string, unknown> {
  return {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    metrics: GA4_METRICS.map((name) => ({ name })),
  };
}

export function summarizeGa4(apiJson: unknown): Ga4Summary {
  const rows = (apiJson as { rows?: Array<{ metricValues?: Array<{ value?: string }> }> })?.rows ?? [];
  const vals = rows[0]?.metricValues ?? [];
  const num = (i: number) => {
    const v = Number(vals[i]?.value ?? 0);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    sessions: Math.round(num(0)),
    totalUsers: Math.round(num(1)),
    conversions: Math.round(num(2)),
    engagementRate: Math.round(num(3) * 10000) / 10000,
  };
}

export async function runGa4Report(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<unknown | null> {
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGa4Summary(cfg: Ga4Config, range: DateRange): Promise<Ga4Summary | null> {
  if (!cfg.propertyId) return null;
  const accessToken = await refreshAccessToken(cfg.refreshToken);
  if (!accessToken) return null;
  const json = await runGa4Report(cfg.propertyId, accessToken, ga4ReportBody(range));
  if (json == null) return null;
  return summarizeGa4(json);
}
