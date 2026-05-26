import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { articles } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cycleId = searchParams.get("cycleId");
  const status = searchParams.get("status");
  try {
    const db = getDb();
    const conditions = [];
    if (cycleId) conditions.push(eq(articles.cycleId, Number(cycleId)));
    if (status) conditions.push(eq(articles.status, status));
    const rows = await db
      .select()
      .from(articles)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(articles.id))
      .limit(500);
    return NextResponse.json({ articles: rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
