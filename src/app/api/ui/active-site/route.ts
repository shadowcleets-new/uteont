import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const KEY = "ui.activeSiteId";

export async function GET() {
  const db = getDb();
  const [row] = await db.select().from(kvSettings).where(eq(kvSettings.key, KEY)).limit(1);
  return NextResponse.json({ siteId: row ? (row.value as { id: number | null }).id : null });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const siteId = body?.siteId;
  if (siteId !== null && typeof siteId !== "number") {
    return NextResponse.json({ error: "siteId must be number or null" }, { status: 400 });
  }
  const db = getDb();
  const value = { id: siteId };
  await db
    .insert(kvSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: kvSettings.key, set: { value, updatedAt: new Date() } });
  return NextResponse.json({ siteId });
}
