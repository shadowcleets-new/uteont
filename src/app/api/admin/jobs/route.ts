import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Auth-gated job-queue X-ray. Shows the last ~20 jobs' live status so we can see
 * whether the worker is claiming + finishing them:
 *   - status "queued" + claimedBy null  -> worker is NOT picking jobs up
 *   - status "claimed"                  -> worker grabbed it (running / stuck)
 *   - status "failed" + error           -> the agent errored (see error)
 *   - status "done"                     -> completed
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized — sign in first" }, { status: 401 });
  }
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: jobs.id,
        agentKey: jobs.agentKey,
        status: jobs.status,
        attempts: jobs.attempts,
        maxAttempts: jobs.maxAttempts,
        claimedBy: jobs.claimedBy,
        error: jobs.error,
        createdAt: jobs.createdAt,
        finishedAt: jobs.finishedAt,
      })
      .from(jobs)
      .orderBy(desc(jobs.id))
      .limit(20);

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

    return NextResponse.json({
      ok: true,
      summary: byStatus,
      hint: "queued+claimedBy:null => worker not claiming; claimed => running/stuck; failed => see error.",
      jobs: rows.map((r) => ({ ...r, error: r.error ? String(r.error).slice(0, 400) : null })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
