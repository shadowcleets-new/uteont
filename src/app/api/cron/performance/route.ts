import { NextResponse } from "next/server";
import { startRun, finishRun } from "@/lib/services/runs";
import { getSiteByKey } from "@/lib/services/sites";

/**
 * Daily cron — pulls GSC performance data.
 * Auth checked by middleware (CRON_SECRET).
 *
 * v1: stubs out the actual GSC fetch (not configured yet). Records a
 * run row so you can see the cron is firing.
 */
export async function GET() {
  // Cron is not scoped to a single site in this version — record the run
  // against the 'default' site. Look it up by key (not hardcoded id=1)
  // so this still works if the default site is recreated with a new id.
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

  // TODO: GSC API call when oauth configured.
  const result = {
    note: "performance-tracking not yet wired — needs GSC OAuth + domain",
    pulledAt: new Date().toISOString(),
  };

  if (run) {
    await finishRun({ runId: run.id, status: "success", result }).catch(() => null);
  }
  return NextResponse.json({ ok: true, ...result });
}
