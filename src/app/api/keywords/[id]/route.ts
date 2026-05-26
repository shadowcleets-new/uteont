import { NextRequest, NextResponse } from "next/server";
import { UpdateKeywordRequest } from "@/lib/validation/schemas";
import { updateKeyword } from "@/lib/services/keywords";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let parsed;
  try {
    parsed = UpdateKeywordRequest.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }

  try {
    const row = await updateKeyword(n, parsed);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ keyword: row });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
