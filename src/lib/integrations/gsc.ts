/**
 * Google Search Console integration.
 *
 * Pure helpers (date range, request body, response summary, consent URL) are
 * unit-tested; the network calls (token refresh, code exchange, query) are
 * defensive — they return null on any failure so callers degrade gracefully
 * rather than throw. Requires GOOGLE_OAUTH_CLIENT_ID/SECRET in the environment;
 * without them every network call no-ops.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly";

export interface GscSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscConfig {
  refreshToken: string;
  propertyUrl: string;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

const day = 86_400_000;
const fmt = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * GSC data lags ~2–3 days, so the window ends 3 days back and spans `days`.
 * Dates are YYYY-MM-DD (UTC), which is what the API expects.
 */
export function gscDateRange(nowMs: number, days = 28): DateRange {
  const end = new Date(nowMs - 3 * day);
  const start = new Date(end.getTime() - days * day);
  return { startDate: fmt(start), endDate: fmt(end) };
}

/** searchAnalytics.query body for a single aggregate row (no dimensions). */
export function buildSearchAnalyticsBody(range: DateRange): Record<string, unknown> {
  return { startDate: range.startDate, endDate: range.endDate, dimensions: [], rowLimit: 1 };
}

/** Reduce the API response to clicks / impressions / ctr / position. */
export function summarizeSearchAnalytics(apiJson: unknown): GscSummary {
  const rows = (apiJson as { rows?: Array<Record<string, number>> })?.rows ?? [];
  if (rows.length === 0) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const r = rows[0];
  return {
    clicks: Math.round(r.clicks ?? 0),
    impressions: Math.round(r.impressions ?? 0),
    ctr: Math.round((r.ctr ?? 0) * 10000) / 10000,
    position: Math.round((r.position ?? 0) * 10) / 10,
  };
}

/** OAuth consent URL (offline + forced consent to guarantee a refresh token), or null if unconfigured. */
export function buildConsentUrl(redirectUri: string, state: string): string | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// --- network (defensive: null on any failure) ----------------------------

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string | null; accessToken: string | null }> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { refreshToken: null, accessToken: null };
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return { refreshToken: null, accessToken: null };
    const json = (await res.json()) as { refresh_token?: string; access_token?: string };
    return { refreshToken: json.refresh_token ?? null, accessToken: json.access_token ?? null };
  } catch {
    return { refreshToken: null, accessToken: null };
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

export async function querySearchAnalytics(
  propertyUrl: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<unknown | null> {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`;
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

/**
 * GSC is picky: the siteUrl must match the property EXACTLY as registered —
 * URL-prefix (`https://x.com/`, with trailing slash) vs domain (`sc-domain:x.com`).
 * The stored domain may not match either, so we try the sensible variants and
 * use whichever the account actually owns. Pure + ordered (most-likely first).
 */
export function candidatePropertyUrls(propertyUrl: string): string[] {
  const raw = propertyUrl.trim();
  if (!raw) return [];
  const out: string[] = [];
  const push = (v: string) => {
    if (v && !out.includes(v)) out.push(v);
  };

  if (raw.startsWith("sc-domain:")) {
    push(raw);
    return out;
  }
  if (/^https?:\/\//i.test(raw)) {
    const noSlash = raw.replace(/\/+$/, "");
    push(noSlash + "/"); // URL-prefix properties carry a trailing slash
    push(noSlash);
    push(raw);
    try {
      push(`sc-domain:${new URL(raw).host.toLowerCase()}`);
    } catch {
      /* ignore */
    }
    return out;
  }
  // bare domain like "prolve.com"
  push(`https://${raw}/`);
  push(`https://${raw}`);
  push(`sc-domain:${raw.toLowerCase()}`);
  return out;
}

/** End-to-end: refresh token → try each property variant → summary. null on any failure. */
export async function fetchGscSummary(
  cfg: GscConfig,
  range: DateRange = gscDateRange(Date.now()),
): Promise<GscSummary | null> {
  const accessToken = await refreshAccessToken(cfg.refreshToken);
  if (!accessToken) return null;
  const body = buildSearchAnalyticsBody(range);
  for (const property of candidatePropertyUrls(cfg.propertyUrl)) {
    const json = await querySearchAnalytics(property, accessToken, body);
    if (json != null) return summarizeSearchAnalytics(json);
  }
  return null;
}
