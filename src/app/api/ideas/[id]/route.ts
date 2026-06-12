import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { UpdateIdeaRequest } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db/client";
import { ideas } from "@/lib/db/schema";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let parsed;
  try {
    parsed = UpdateIdeaRequest.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }
  try {
    const db = getDb();
    const setObj: Record<string, unknown> = { ...parsed };
    if (parsed.status && ["approved", "rejected", "done"].includes(parsed.status)) {
      setObj.decidedAt = new Date();
    }
    const [row] = await db.update(ideas).set(setObj).where(eq(ideas.id, n)).returning();
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ idea: row });
  } catch (e: unknown) {
    console.error("[api]", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
