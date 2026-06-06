import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { UpdateIdeaRequest } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db/client";
import { ideas } from "@/lib/db/schema";
import {
  addExclusion,
  extractHeadPhrase,
} from "@/lib/services/keyword-exclusions";

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
    const [existing] = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, n))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const setObj: Record<string, unknown> = { ...parsed };
    if (parsed.status && ["approved", "rejected", "done"].includes(parsed.status)) {
      setObj.decidedAt = new Date();
    }
    const [row] = await db.update(ideas).set(setObj).where(eq(ideas.id, n)).returning();
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (parsed.status === "rejected" && existing.siteId) {
      const phrase = extractHeadPhrase(existing.angle);
      if (phrase) {
        await addExclusion({
          siteId: existing.siteId,
          phrase,
          reason: parsed.rejectReason,
          source: "idea",
          sourceId: existing.id,
        }).catch((err) => {
          console.warn(`[ideas.reject -> exclusion] failed:`, err);
        });
      }
    }

    return NextResponse.json({ idea: row });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
