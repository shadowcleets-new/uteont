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
import { siteIntegrations } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto/integration-secrets";
import { fetchGscSummary, gscDateRange, type GscConfig, type DateRange } from "@/lib/integrations/gsc";

export interface PerformanceResult {
  configured: boolean;
  note?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
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

  return { configured: true, ...summary, range, pulledAt };
}
