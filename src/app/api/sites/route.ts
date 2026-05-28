import { NextRequest, NextResponse } from "next/server";
import { listSites, createSite, SiteKeyTakenError } from "@/lib/services/sites";
import { siteCreateSchema } from "@/lib/validation/site";
import { getDb } from "@/lib/db/client";
import { siteIntegrations } from "@/lib/db/schema";
import { count, inArray } from "drizzle-orm";

export async function GET() {
  const sites = await listSites();
  if (sites.length === 0) return NextResponse.json([]);
  // attach integrationCount per site without N+1
  const ids = sites.map((s) => s.id);
  const db = getDb();
  const grouped = await db.select({
    siteId: siteIntegrations.siteId,
    n: count(siteIntegrations.id),
  })
    .from(siteIntegrations)
    .where(inArray(siteIntegrations.siteId, ids))
    .groupBy(siteIntegrations.siteId);
  const countById = new Map(grouped.map((r) => [r.siteId, Number(r.n)]));
  return NextResponse.json(
    sites.map((s) => ({ ...s, integrationCount: countById.get(s.id) ?? 0 })),
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = siteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const row = await createSite(parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof SiteKeyTakenError) {
      return NextResponse.json({ error: "key_taken" }, { status: 409 });
    }
    throw e;
  }
}
