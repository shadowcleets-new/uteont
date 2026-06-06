import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { UpdateArticleRequest } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db/client";
import { articles } from "@/lib/db/schema";
import {
  addExclusion,
  extractHeadPhrase,
} from "@/lib/services/keyword-exclusions";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    const db = getDb();
    const [row] = await db.select().from(articles).where(eq(articles.id, n)).limit(1);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ article: row });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let parsed;
  try {
    parsed = UpdateArticleRequest.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }
  try {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, n))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const [row] = await db
      .update(articles)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(articles.id, n))
      .returning();
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    if ((parsed.status === "rejected" || parsed.status === "shelved") && existing.siteId) {
      const phrase = extractHeadPhrase(existing.title);
      if (phrase) {
        await addExclusion({
          siteId: existing.siteId,
          phrase,
          source: "article",
          sourceId: existing.id,
        }).catch((err) => {
          console.warn(`[articles.reject -> exclusion] failed:`, err);
        });
      }
    }

    return NextResponse.json({ article: row });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
