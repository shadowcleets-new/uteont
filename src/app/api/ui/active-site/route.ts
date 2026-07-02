import { NextRequest, NextResponse } from "next/server";
import { getActiveSiteId, setActiveSiteId } from "@/lib/services/app-settings";

export async function GET() {
  return NextResponse.json({ siteId: await getActiveSiteId() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const siteId = body?.siteId;
  if (siteId !== null && typeof siteId !== "number") {
    return NextResponse.json({ error: "siteId must be number or null" }, { status: 400 });
  }
  await setActiveSiteId(siteId);
  return NextResponse.json({ siteId });
}
