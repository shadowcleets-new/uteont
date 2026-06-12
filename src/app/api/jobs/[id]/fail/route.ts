import { NextRequest, NextResponse } from "next/server";
import { FailJobRequest } from "@/lib/validation/schemas";
import { failJob } from "@/lib/services/jobs";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let parsed;
  try {
    parsed = FailJobRequest.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }
  try {
    await failJob(n, parsed.error, parsed.retry);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[api]", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
