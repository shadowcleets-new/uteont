import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, siteIntegrations } from "@/lib/db/schema";
import { startRun, finishRun } from "@/lib/services/runs";
import { runPerformanceTracking } from "@/lib/agent-runners/performance-tracking";
import { snapshotAllActiveTargets } from "@/lib/services/target-snapshots";
import { notifySlackForSite } from "@/lib/services/slack-notify";
import { recordSiteDaily } from "@/lib/services/metrics-timeseries";

/**
 * Daily cron — the once-a-day heartbeat.
 *   1. Pull Google Search Console for every site that has a gsc integration
 *      (records a performance-tracking run; no-op/degrade if unconfigured).
 *   2. Snapshot every active target so the trajectory accrues a point per day
 *      even when nobody opens the app.
 * Auth checked by middleware (CRON_SECRET, set automatically by Vercel for
 * crons declared in vercel.json).
 */
export async function GET() {
  let perfSites = 0;
  let perfPulled = 0;
  let metricsRows = 0;
  try {
    const db = getDb();
    const rows = await db
      .select({ siteId: siteIntegrations.siteId })
      .from(siteIntegrations)
      .where(eq(siteIntegrations.kind, "gsc"));
    const siteIds = [...new Set(rows.map((r) => r.siteId))];
    perfSites = siteIds.length;
    for (const siteId of siteIds) {
      const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
      const run = await startRun({
        subjectKey: "agent.performance-tracking",
        category: "agent",
        action: "daily-pull",
        siteId,
      }).catch(() => null);
      const result = await runPerformanceTracking(siteId, site?.domain ?? "");
      if (run) {
        await finishRun({
          runId: run.id,
          status: "success",
          result: result as unknown as Record<string, unknown>,
        }).catch(() => null);
      }
      if (result.configured) {
        perfPulled++;
        // IP-10: persist the day's site-level metrics into the time-series
        // substrate so trend/decay math has memory. Idempotent on the day key;
        // best-effort (a missing table degrades to a no-op).
        try {
          metricsRows += await recordSiteDaily(siteId, site?.domain ?? `site-${siteId}`, {
            clicks: result.clicks,
            impressions: result.impressions,
            ctr: result.ctr,
            position: result.position,
          });
        } catch (e) {
          console.warn("[cron.daily] metrics persist failed:", e);
        }
        await notifySlackForSite(
          siteId,
          `UTEONT daily — Search Console (28d): ${result.clicks ?? 0} clicks, ${result.impressions ?? 0} impressions.`,
        ).catch(() => {});
      }
    }
  } catch (e) {
    console.warn("[cron.daily] performance pull failed:", e);
  }

  let snapshots = 0;
  try {
    snapshots = await snapshotAllActiveTargets();
  } catch (e) {
    console.warn("[cron.daily] snapshot failed:", e);
  }

  return NextResponse.json({
    ok: true,
    performance: { sites: perfSites, pulled: perfPulled },
    metrics: metricsRows,
    snapshots,
  });
}
