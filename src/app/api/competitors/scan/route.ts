import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { startRun, finishRun } from "@/lib/services/runs";

const ScanRequest = z.object({
  url: z.string().url(),
  note: z.string().max(500).optional(),
});

/**
 * Records a competitor-scan request as an infra run. The real scraper
 * runs on the browser worker — wiring its job-claim path lands in the
 * follow-up "Competitor Audit Agent" spec. For Milestone 7 we want a
 * trail in the runs table so the dashboard and Pipeline pages can show
 * an entry.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = ScanRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let runRow;
  try {
    runRow = await startRun({
      subjectKey: "infra.competitor-scan",
      category: "infra",
      action: `scan ${parsed.data.url}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  // No real scraper yet — mark the run as success with a stub result so
  // the runs table doesn't show a spurious failure indicator. When the
  // browser worker picks this up, switch this to enqueueJob + leave the
  // run open until the worker reports completion.
  await finishRun({
    runId: runRow.id,
    status: "success",
    result: {
      note: parsed.data.note ?? null,
      url: parsed.data.url,
      message:
        "scan-request recorded; real crawl pending worker-side competitor-audit-agent implementation",
    },
  }).catch(() => undefined);

  return NextResponse.json({ runId: runRow.id, queued: false, recorded: true });
}
