import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";
import { startRun, finishRun } from "@/lib/services/runs";
import { runSiteCrawl } from "@/lib/agent-runners/site-crawl";

const ScanRequest = z.object({
  url: z.string().url(),
  note: z.string().max(500).optional(),
});

async function getActiveSiteId(): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(kvSettings)
    .where(eq(kvSettings.key, "ui.activeSiteId"))
    .limit(1);
  return row ? (row.value as { id: number | null }).id : null;
}

/**
 * Competitor scan = the real Site Crawl agent pointed at the competitor's
 * URL, recorded as an infra run so the Directory tab (and /runs) can
 * browse the history. Session auth via middleware.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ScanRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const siteId = await getActiveSiteId().catch(() => null);
  if (!siteId) {
    return NextResponse.json(
      { error: "no_active_site", message: "Select a site (top-left) first — scans are recorded against it." },
      { status: 400 },
    );
  }

  let runRow;
  try {
    runRow = await startRun({
      subjectKey: "infra.competitor-scan",
      category: "infra",
      action: `scan ${parsed.data.url}`,
      siteId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  try {
    const result = await runSiteCrawl(parsed.data.url);
    await finishRun({
      runId: runRow.id,
      status: "success",
      result: {
        url: parsed.data.url,
        note: parsed.data.note ?? null,
        crawl: result as unknown as Record<string, unknown>,
      },
    });
    return NextResponse.json({
      runId: runRow.id,
      score: result.score,
      crawled: result.crawled,
      issueCount: result.issues.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun({ runId: runRow.id, status: "failure", error: msg }).catch(() => undefined);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
