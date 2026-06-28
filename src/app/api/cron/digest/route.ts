import { NextResponse } from "next/server";
import { lt, eq, and } from "drizzle-orm";
import { sendMessage } from "@/lib/services/telegram";
import { listRuns } from "@/lib/services/runs";
import { purgeOldAttempts } from "@/lib/services/login-attempts";
import { purgeOldJobEvents } from "@/lib/services/job-events";
import { getDb } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";

/**
 * Weekly digest cron — summarizes the last 7 days, sends to Telegram,
 * and runs scheduled maintenance (F-027 purge old jobs, login attempts).
 * Auth checked by middleware (CRON_SECRET).
 */
export async function GET() {
  // 1. Build the digest
  let summary = "📊 *UTEONT weekly digest*\n";
  let runsSummary = "";
  try {
    const recent = await listRuns(undefined, 200);
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const inWeek = recent.filter(
      (r) => r.startedAt && new Date(r.startedAt).getTime() > sevenDaysAgo,
    );
    const byStatus = inWeek.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    runsSummary = `Last 7 days: ${inWeek.length} runs` +
      (Object.keys(byStatus).length
        ? ` (${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(", ")})`
        : "");
  } catch (e) {
    console.warn("[cron.digest] listRuns failed:", e);
    runsSummary = "Last 7 days: (db unreachable)";
  }
  summary += runsSummary;

  // 2. F-027: purge completed jobs older than 30 days (typed-output tables
  //    keep the durable record; jobs is just the queue).
  let purgedJobs = 0;
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const result = await db
      .delete(jobs)
      .where(and(eq(jobs.status, "done"), lt(jobs.createdAt, cutoff)));
    purgedJobs = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  } catch (e) {
    console.warn("[cron.digest] purge jobs failed:", e);
  }

  // 3. F-010: purge login attempts older than 30 days.
  const purgedAttempts = await purgeOldAttempts();

  // 4. N-15: purge job_events older than the retention window (default 30 days,
  //    env-tunable via JOB_EVENTS_RETENTION_DAYS). The F-027 jobs purge orphans
  //    these append-only rows, so they grow unbounded without their own sweep.
  let purgedJobEvents = 0;
  try {
    const retentionDays = Number(process.env.JOB_EVENTS_RETENTION_DAYS) || 30;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
    purgedJobEvents = await purgeOldJobEvents(cutoff);
  } catch (e) {
    console.warn("[cron.digest] purge job events failed:", e);
  }

  summary +=
    purgedJobs || purgedAttempts || purgedJobEvents
      ? `\n\nMaintenance: purged ${purgedJobs} old jobs, ${purgedAttempts} login attempts, ${purgedJobEvents} job events.`
      : "";

  const sent = await sendMessage({ text: summary });
  return NextResponse.json({
    ok: true,
    telegramSent: sent,
    digest: summary,
    maintenance: { purgedJobs, purgedAttempts, purgedJobEvents },
  });
}
