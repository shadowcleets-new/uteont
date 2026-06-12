import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listTactics } from "@/lib/services/tactics";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const sourceType = params.get("sourceType") || undefined;
  const siteIdRaw = params.get("siteId");
  const siteId = siteIdRaw ? Number(siteIdRaw) : undefined;
  try {
    const rows = await listTactics({
      sourceType,
      siteId: Number.isFinite(siteId) ? siteId : undefined,
    });
    return NextResponse.json({ tactics: rows });
  } catch (e) {
    console.error("[api] list tactics failed", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
