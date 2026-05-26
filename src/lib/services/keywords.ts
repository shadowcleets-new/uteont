import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywords } from "@/lib/db/schema";

export async function listKeywords(opts: { cycleId?: number; status?: string; limit?: number } = {}) {
  const db = getDb();
  const conditions = [];
  if (opts.cycleId) conditions.push(eq(keywords.cycleId, opts.cycleId));
  if (opts.status) conditions.push(eq(keywords.status, opts.status));
  return db
    .select()
    .from(keywords)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(keywords.priorityRank))
    .limit(opts.limit ?? 500);
}

export async function updateKeyword(
  id: number,
  patch: { status?: string; shelvedReason?: string },
) {
  const db = getDb();
  const setObj: Record<string, unknown> = { ...patch };
  if (patch.status === "approved") setObj.approvedAt = new Date();
  const [row] = await db
    .update(keywords)
    .set(setObj)
    .where(eq(keywords.id, id))
    .returning();
  return row ?? null;
}

export async function bulkInsertKeywords(
  cycleId: number,
  runId: number,
  items: Array<{
    keyword: string;
    searchVolumeEstimate: number;
    competitionScore: number;
    source: string;
    priorityRank: number;
  }>,
) {
  if (items.length === 0) return [];
  const db = getDb();
  return db
    .insert(keywords)
    .values(items.map((it) => ({ ...it, cycleId, runId, status: "researched" })))
    .returning();
}
