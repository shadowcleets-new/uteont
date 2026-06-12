import { NextRequest, NextResponse } from "next/server";
import { getPipelineState } from "@/lib/pipeline/snapshot";

interface Ctx { params: Promise<{ cycleId: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { cycleId } = await params;
  const n = Number(cycleId);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: "bad_cycle_id" }, { status: 400 });
  }
  try {
    const state = await getPipelineState(n);
    return NextResponse.json({ cycleId: n, state });
  } catch (e) {
    console.error("[api] pipeline state failed", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
