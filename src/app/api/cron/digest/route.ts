import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/services/telegram";
import { listRuns } from "@/lib/services/runs";

/**
 * Weekly digest cron — summarizes the last 7 days and sends to Telegram.
 * Auth checked by middleware (CRON_SECRET).
 */
export async function GET() {
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
  } catch {
    runsSummary = "Last 7 days: (db unreachable)";
  }
  summary += runsSummary;

  const sent = await sendMessage({ text: summary });
  return NextResponse.json({ ok: true, telegramSent: sent, digest: summary });
}
