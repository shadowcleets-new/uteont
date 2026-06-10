import { NextRequest, NextResponse } from "next/server";
import { removeExclusion } from "@/lib/services/keyword-exclusions";

interface Ctx { params: Promise<{ id: string; exId: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { exId } = await params;
  const n = Number(exId);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  await removeExclusion(n);
  return new NextResponse(null, { status: 204 });
}
