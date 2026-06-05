import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPipelineState } from "@/lib/pipeline/snapshot";

interface Ctx {
  params: Promise<{ cycleId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { cycleId } = await params;
  const n = Number(cycleId);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: "bad_cycle_id" }, { status: 400 });
  }
  try {
    const state = await getPipelineState(n);
    return NextResponse.json({ cycleId: n, state });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
