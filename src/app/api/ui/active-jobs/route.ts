import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { getActiveSiteId } from "@/lib/services/app-settings";

// Live in-flight jobs for the active site (session-gated by middleware —
// deliberately under /api/ui, NOT /api/jobs which is worker-token territory).
export async function GET() {
  const siteId = await getActiveSiteId();
  if (!siteId) return NextResponse.json({ jobs: [] });
  const db = getDb();
  const rows = await db
    .select({ id: jobs.id, agentKey: jobs.agentKey, status: jobs.status, createdAt: jobs.createdAt, payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.siteId, siteId), inArray(jobs.status, ["queued", "claimed"])))
    .orderBy(desc(jobs.id))
    .limit(10);
  return NextResponse.json({
    jobs: rows.map((r) => {
      const plan = (r.payload as Record<string, unknown> | null)?._planContext as
        | { planId?: number; stepN?: number } | undefined;
      return {
        id: r.id, agentKey: r.agentKey, status: r.status,
        createdAt: r.createdAt,
        planId: plan?.planId ?? null, stepN: plan?.stepN ?? null,
      };
    }),
  });
}
