import { NextRequest, NextResponse } from "next/server";
import { listKeywords } from "@/lib/services/keywords";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cycleId = searchParams.get("cycleId");
  const status = searchParams.get("status") || undefined;
  const limit = Number(searchParams.get("limit") ?? 500);
  try {
    const rows = await listKeywords({
      cycleId: cycleId ? Number(cycleId) : undefined,
      status,
      limit: Math.min(1000, Math.max(1, limit)),
    });
    return NextResponse.json({ keywords: rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
