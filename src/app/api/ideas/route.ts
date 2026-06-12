import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ideas } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cycleId = searchParams.get("cycleId");
  const status = searchParams.get("status");
  try {
    const db = getDb();
    const conditions = [];
    if (cycleId) conditions.push(eq(ideas.cycleId, Number(cycleId)));
    if (status) conditions.push(eq(ideas.status, status));
    const rows = await db
      .select()
      .from(ideas)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(ideas.id))
      .limit(500);
    return NextResponse.json({ ideas: rows });
  } catch (e: unknown) {
    console.error("[api]", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
