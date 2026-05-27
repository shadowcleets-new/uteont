import { NextResponse } from "next/server";
import { lt, eq, and } from "drizzle-orm";
import { sendMessage } from "@/lib/services/telegram";
import { listRuns } from "@/lib/services/runs";
import { purgeOldAttempts } from "@/lib/services/login-attempts";
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

  summary +=
    purgedJobs || purgedAttempts
      ? `\n\nMaintenance: purged ${purgedJobs} old jobs, ${purgedAttempts} login attempts.`
      : "";

  const sent = await sendMessage({ text: summary });
  return NextResponse.json({
    ok: true,
    telegramSent: sent,
    digest: summary,
    maintenance: { purgedJobs, purgedAttempts },
  });
}
