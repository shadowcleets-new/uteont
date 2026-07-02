import { NextResponse } from "next/server";
import { startRun, finishRun } from "@/lib/services/runs";
import { listSites } from "@/lib/services/sites";
import { runPerformanceTracking } from "@/lib/agent-runners/performance-tracking";

/**
 * Cron — pulls Google Search Console / GA4 performance for EVERY active site and
 * records a performance-tracking run per site (feeds the gsc_clicks /
 * gsc_impressions / ga4_sessions target metrics). A scheduled job has no UI
 * session, so it must NOT use the UI active-site toggle — it processes all
 * sites. Degrades gracefully when a site's GSC/GA4 isn't connected.
 * Auth checked by middleware (CRON_SECRET).
 */
export async function GET() {
  const sites = await listSites(); // excludes archived
  const results: Array<Record<string, unknown>> = [];
  for (const site of sites) {
    const run = await startRun({
      subjectKey: "agent.performance-tracking",
      category: "agent",
      action: "daily-pull",
      siteId: site.id,
    }).catch(() => null);

    const result = await runPerformanceTracking(site.id, site.domain).catch(
      (e) => ({ error: e instanceof Error ? e.message : String(e) }),
    );

    if (run) {
      await finishRun({
        runId: run.id,
        status: "success",
        result: result as Record<string, unknown>,
      }).catch(() => null);
    }
    results.push({ site: site.key, ...result });
  }
  return NextResponse.json({ ok: true, sites: results.length, results });
}
