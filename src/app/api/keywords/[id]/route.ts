import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { UpdateKeywordRequest } from "@/lib/validation/schemas";
import { updateKeyword } from "@/lib/services/keywords";
import { getDb } from "@/lib/db/client";
import { keywords } from "@/lib/db/schema";
import { addExclusion } from "@/lib/services/keyword-exclusions";

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
    // Capture the pre-image so we can persist the head phrase as an
    // exclusion when the editor shelves the row.
    const db = getDb();
    const [existing] = await db
      .select()
      .from(keywords)
      .where(eq(keywords.id, n))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const row = await updateKeyword(n, parsed);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (parsed.status === "shelved" && existing.siteId) {
      // Best-effort capture; the unique index dedups case variants.
      await addExclusion({
        siteId: existing.siteId,
        phrase: existing.keyword,
        reason: parsed.shelvedReason,
        source: "keyword",
        sourceId: existing.id,
      }).catch((err) => {
        console.warn(`[keywords.shelf -> exclusion] failed:`, err);
      });
    }

    return NextResponse.json({ keyword: row });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
