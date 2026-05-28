import { NextRequest, NextResponse } from "next/server";
import { listRuns } from "@/lib/services/runs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject") || undefined;
  const siteId = searchParams.get("siteId");
  const limit = Number(searchParams.get("limit") ?? 50);
  try {
    const rows = await listRuns(
      subject,
      Math.min(500, Math.max(1, limit)),
      { siteId: siteId ? Number(siteId) : undefined },
    );
    return NextResponse.json({ runs: rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
