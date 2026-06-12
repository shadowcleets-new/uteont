import { NextRequest, NextResponse } from "next/server";
import { listKeywords } from "@/lib/services/keywords";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cycleId = searchParams.get("cycleId");
  const siteId = searchParams.get("siteId");
  const status = searchParams.get("status") || undefined;
  const limit = Number(searchParams.get("limit") ?? 500);
  try {
    const rows = await listKeywords({
      cycleId: cycleId ? Number(cycleId) : undefined,
      siteId: siteId ? Number(siteId) : undefined,
      status,
      limit: Math.min(1000, Math.max(1, limit)),
    });
    return NextResponse.json({ keywords: rows });
  } catch (e: unknown) {
    console.error("[api]", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
