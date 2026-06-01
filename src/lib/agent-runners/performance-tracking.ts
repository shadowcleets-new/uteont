/**
 * Performance Tracking Agent (inline, fn-runtime).
 *
 * Pulls real Google Search Console metrics (clicks / impressions / ctr /
 * position) for the site, if a GSC integration is connected. Degrades
 * gracefully: when nothing is connected (or the encryption key / OAuth
 * credentials are absent) it returns a `configured: false` result with a note
 * instead of throwing, so the agent always runs.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { siteIntegrations, sites } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto/integration-secrets";
import { fetchGscSummary, gscDateRange, type GscConfig, type DateRange } from "@/lib/integrations/gsc";
import { fetchGa4Summary } from "@/lib/integrations/ga4";

export interface PerformanceResult {
  configured: boolean;
  note?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  /** GA4 (present only when the site has a GA4 property id and the pull succeeds). */
  ga4Sessions?: number;
  ga4Users?: number;
  ga4Conversions?: number;
  ga4EngagementRate?: number;
  range?: DateRange;
  pulledAt: string;
}

/** Load the site's decrypted GSC config, or null (also null if the key is missing). */
async function loadGscConfig(siteId: number, fallbackProperty?: string): Promise<GscConfig | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(siteIntegrations)
    .where(and(eq(siteIntegrations.siteId, siteId), eq(siteIntegrations.kind, "gsc")))
    .limit(1);
  if (!row) return null;
  // decrypt throws if CONNECTION_ENCRYPTION_KEY is absent — let the caller catch.
  const plain = decrypt(row.config, row.configIv, row.configTag) as { refreshToken?: string; propertyUrl?: string };
  if (!plain.refreshToken) return null;
  return { refreshToken: plain.refreshToken, propertyUrl: plain.propertyUrl || fallbackProperty || "" };
}

export async function runPerformanceTracking(siteId: number, fallbackProperty?: string): Promise<PerformanceResult> {
  const pulledAt = new Date().toISOString();

  let cfg: GscConfig | null = null;
  try {
    cfg = await loadGscConfig(siteId, fallbackProperty);
  } catch {
    return {
      configured: false,
      note: "Search Console is connected but CONNECTION_ENCRYPTION_KEY is not set in the environment.",
      pulledAt,
    };
  }

  if (!cfg || !cfg.propertyUrl) {
    return {
      configured: false,
      note: "Connect Google Search Console on the site's Integrations page to pull real performance data.",
      pulledAt,
    };
  }

  const range = gscDateRange(Date.now());
  const summary = await fetchGscSummary(cfg, range);
  if (!summary) {
    return {
      configured: false,
      note: "GSC query failed — check the Google OAuth credentials and that the property matches the site.",
      pulledAt,
    };
  }

  // GA4 (optional): same Google refresh token + the site's GA4 property id.
  let ga4: Awaited<ReturnType<typeof fetchGa4Summary>> = null;
  try {
    const db = getDb();
    const [site] = await db.select({ ga4PropertyId: sites.ga4PropertyId }).from(sites).where(eq(sites.id, siteId)).limit(1);
    if (site?.ga4PropertyId) {
      ga4 = await fetchGa4Summary({ refreshToken: cfg.refreshToken, propertyId: site.ga4PropertyId }, range);
    }
  } catch (e) {
    console.warn("performance-tracking: GA4 pull failed", e);
  }

  return {
    configured: true,
    ...summary,
    range,
    pulledAt,
    ...(ga4
      ? {
          ga4Sessions: ga4.sessions,
          ga4Users: ga4.totalUsers,
          ga4Conversions: ga4.conversions,
          ga4EngagementRate: ga4.engagementRate,
        }
      : {}),
  };
}
