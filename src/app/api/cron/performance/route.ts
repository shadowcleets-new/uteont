import { NextResponse } from "next/server";
import { startRun, finishRun } from "@/lib/services/runs";
import { getSiteByKey } from "@/lib/services/sites";
import { runPerformanceTracking } from "@/lib/agent-runners/performance-tracking";

/**
 * Daily cron — pulls Google Search Console performance for the default site and
 * records it as a performance-tracking run (which feeds the gsc_clicks /
 * gsc_impressions target metrics). Degrades gracefully when GSC isn't connected.
 * Auth checked by middleware (CRON_SECRET).
 */
export async function GET() {
  const defaultSite = await getSiteByKey("default");
  if (!defaultSite) {
    return NextResponse.json(
      { ok: false, error: "default site missing — run db:migrate" },
      { status: 500 },
    );
  }
  const run = await startRun({
    subjectKey: "agent.performance-tracking",
    category: "agent",
    action: "daily-pull",
    siteId: defaultSite.id,
  }).catch(() => null);

  const result = await runPerformanceTracking(defaultSite.id, defaultSite.domain);

  if (run) {
    await finishRun({
      runId: run.id,
      status: "success",
      result: result as unknown as Record<string, unknown>,
    }).catch(() => null);
  }
  return NextResponse.json({ ok: true, ...result });
}
