import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { decideCheckpoint, CheckpointError } from "@/lib/services/checkpoints";
import { VERBS, type Verb } from "@/lib/services/checkpoint-machine";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const verb = body.verb as Verb;
  if (!VERBS.includes(verb)) {
    return NextResponse.json({ error: `verb must be one of ${VERBS.join(", ")}` }, { status: 400 });
  }
  try {
    const row = await decideCheckpoint(Number(id), verb, {
      note: typeof body.note === "string" ? body.note : undefined,
      actor: session.user?.name ?? "user",
    });
    return NextResponse.json({ checkpoint: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "decision failed";
    return NextResponse.json({ error: msg }, { status: e instanceof CheckpointError ? 409 : 500 });
  }
}
