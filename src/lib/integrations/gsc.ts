/**
 * Google Search Console integration.
 *
 * Pure helpers (date range, request body, response summary, consent URL) are
 * unit-tested; the network calls (token refresh, code exchange, query) are
 * defensive — they return null on any failure so callers degrade gracefully
 * rather than throw. Requires GOOGLE_OAUTH_CLIENT_ID/SECRET in the environment;
 * without them every network call no-ops.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

/** searchAnalytics.query body for one row per day (charts). */
export function buildSearchAnalyticsBodyByDate(range: DateRange): Record<string, unknown> {
  return { startDate: range.startDate, endDate: range.endDate, dimensions: ["date"], rowLimit: 1000 };
}

/** searchAnalytics.query body for per-query rows (rankings table). */
export function buildSearchAnalyticsBodyByQuery(range: DateRange, limit = 100): Record<string, unknown> {
  return { startDate: range.startDate, endDate: range.endDate, dimensions: ["query"], rowLimit: limit };
}

export interface GscDailyPoint {
  day: string; // YYYY-MM-DD
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

type KeyedRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };

/** Map a by-date response to chronological day points. [] on anything malformed. */
export function parseDailyRows(apiJson: unknown): GscDailyPoint[] {
  const rows = (apiJson as { rows?: KeyedRow[] })?.rows ?? [];
  return rows
    .filter((r) => Array.isArray(r.keys) && typeof r.keys[0] === "string")
    .map((r) => ({
      day: r.keys![0],
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: Math.round((r.ctr ?? 0) * 10000) / 10000,
      position: Math.round((r.position ?? 0) * 10) / 10,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Map a by-query response to query rows, preserving the API's click-sorted order. */
export function parseQueryRows(apiJson: unknown): GscQueryRow[] {
  const rows = (apiJson as { rows?: KeyedRow[] })?.rows ?? [];
  return rows
    .filter((r) => Array.isArray(r.keys) && typeof r.keys[0] === "string")
    .map((r) => ({
      query: r.keys![0],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
}

// --- signed OAuth state (CSRF protection, N-17) ---------------------------

/** Cookie name the callback reads to bind state back to the browser that started the flow. */
export const GSC_OAUTH_STATE_COOKIE = "gsc_oauth_state";

/** Secret used to sign the OAuth state. Reuses the app's existing server secret. */
function stateSecret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

function signState(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/**
 * Build a signed OAuth `state` that binds the flow to a server secret + a random
 * nonce. Returns the `state` string to hand to Google and the `nonce` to store
 * in an httpOnly cookie; the callback rejects any state whose nonce doesn't
 * match the cookie (so a forged/foreign state can't be replayed). Returns null
 * if no server secret is configured.
 */
export function buildSignedState(siteId: number): { state: string; nonce: string } | null {
  const secret = stateSecret();
  if (!secret) return null;
  const nonce = randomBytes(16).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify({ siteId, nonce })).toString("base64url");
  const sig = signState(payloadB64, secret);
  return { state: `${payloadB64}.${sig}`, nonce };
}

/**
 * Verify a signed OAuth `state` against the server secret and the nonce stored
 * in the request cookie. Returns the bound `siteId` only when the HMAC is valid
 * (constant-time compare) AND the embedded nonce matches `cookieNonce`. Any
 * tampered, foreign, or unbound state yields null.
 */
export function verifySignedState(state: string | null, cookieNonce: string | null): number | null {
  const secret = stateSecret();
  if (!secret || !state || !cookieNonce) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  const expected = signState(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: { siteId?: unknown; nonce?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed.nonce !== "string") return null;
  const n = Buffer.from(parsed.nonce);
  const c = Buffer.from(cookieNonce);
  if (n.length !== c.length || !timingSafeEqual(n, c)) return null;

  const siteId = Number(parsed.siteId);
  return Number.isFinite(siteId) && siteId > 0 ? siteId : null;
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

/** End-to-end: refresh token → per-day series. null on any failure. */
export async function fetchGscDailySeries(
  cfg: GscConfig,
  range: DateRange = gscDateRange(Date.now()),
): Promise<GscDailyPoint[] | null> {
  const accessToken = await refreshAccessToken(cfg.refreshToken);
  if (!accessToken) return null;
  const body = buildSearchAnalyticsBodyByDate(range);
  for (const property of candidatePropertyUrls(cfg.propertyUrl)) {
    const json = await querySearchAnalytics(property, accessToken, body);
    if (json != null) return parseDailyRows(json);
  }
  return null;
}

/** End-to-end: refresh token → top queries. null on any failure. */
export async function fetchGscTopQueries(
  cfg: GscConfig,
  range: DateRange = gscDateRange(Date.now()),
  limit = 100,
): Promise<GscQueryRow[] | null> {
  const accessToken = await refreshAccessToken(cfg.refreshToken);
  if (!accessToken) return null;
  const body = buildSearchAnalyticsBodyByQuery(range, limit);
  for (const property of candidatePropertyUrls(cfg.propertyUrl)) {
    const json = await querySearchAnalytics(property, accessToken, body);
    if (json != null) return parseQueryRows(json);
  }
  return null;
}

export interface GscPageQueryRow {
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** searchAnalytics.query body for per-(page, query) rows (cannibalization, IP-42). */
export function buildSearchAnalyticsBodyByPageQuery(range: DateRange, limit = 1000): Record<string, unknown> {
  return { startDate: range.startDate, endDate: range.endDate, dimensions: ["page", "query"], rowLimit: limit };
}

/** Map a by-(page, query) response to typed rows. [] on anything malformed. */
export function parsePageQueryRows(apiJson: unknown): GscPageQueryRow[] {
  const rows = (apiJson as { rows?: KeyedRow[] })?.rows ?? [];
  return rows
    .filter(
      (r) => Array.isArray(r.keys) && typeof r.keys[0] === "string" && typeof r.keys[1] === "string",
    )
    .map((r) => ({
      page: r.keys![0],
      query: r.keys![1],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
}

/** End-to-end: refresh token → per-(page, query) rows (feeds the cannibalization scan). null on any failure. */
export async function fetchGscPageQueryRows(
  cfg: GscConfig,
  range: DateRange = gscDateRange(Date.now()),
  limit = 1000,
): Promise<GscPageQueryRow[] | null> {
  const accessToken = await refreshAccessToken(cfg.refreshToken);
  if (!accessToken) return null;
  const body = buildSearchAnalyticsBodyByPageQuery(range, limit);
  for (const property of candidatePropertyUrls(cfg.propertyUrl)) {
    const json = await querySearchAnalytics(property, accessToken, body);
    if (json != null) return parsePageQueryRows(json);
  }
  return null;
}
