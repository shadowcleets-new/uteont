import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { undoCheckpoint, CheckpointError } from "@/lib/services/checkpoints";

/** LO-18: undo a recently-decided checkpoint, re-opening it to 'pending'. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const row = await undoCheckpoint(Number(id));
    return NextResponse.json({ checkpoint: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "undo failed";
    return NextResponse.json({ error: msg }, { status: e instanceof CheckpointError ? 409 : 500 });
  }
}
