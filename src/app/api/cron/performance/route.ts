import { NextResponse } from "next/server";
import { startRun, finishRun } from "@/lib/services/runs";

/**
 * Daily cron — pulls GSC performance data.
 * Auth checked by middleware (CRON_SECRET).
 *
 * v1: stubs out the actual GSC fetch (not configured yet). Records a
 * run row so you can see the cron is firing.
 */
export async function GET() {
  const run = await startRun({
    subjectKey: "agent.performance-tracking",
    category: "agent",
    action: "daily-pull",
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
