import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywords, type Keyword } from "@/lib/db/schema";
import {
  addExclusion,
  removeExclusionByPhrase,
} from "./keyword-exclusions";

export async function listKeywords(opts: { cycleId?: number; siteId?: number; status?: string; limit?: number } = {}) {
  const db = getDb();
  const conditions = [];
  if (opts.cycleId) conditions.push(eq(keywords.cycleId, opts.cycleId));
  if (opts.siteId) conditions.push(eq(keywords.siteId, opts.siteId));
  if (opts.status) conditions.push(eq(keywords.status, opts.status));
  return db
    .select()
    .from(keywords)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(keywords.priorityRank))
    .limit(opts.limit ?? 500);
}

function buildStatusSet(patch: { status?: string; shelvedReason?: string | null }): Record<string, unknown> {
  const setObj: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    setObj.status = patch.status;
    if (patch.status === "approved") setObj.approvedAt = new Date();
    // Moving off "shelved" clears the stale reason; shelving keeps the provided one.
    if (patch.status === "shelved") setObj.shelvedReason = patch.shelvedReason ?? null;
    else setObj.shelvedReason = null;
  } else if (patch.shelvedReason !== undefined) {
    setObj.shelvedReason = patch.shelvedReason;
  }
  return setObj;
}

/**
 * Closed-loop side-effect of a status change: shelving captures the
 * phrase as an exclusion (future research runs suppress it); any other
 * status releases a matching exclusion so a restored/approved keyword
 * isn't re-blocked at the next ingestion. Best-effort — an exclusion
 * hiccup never fails the keyword update itself.
 */
async function syncExclusionForStatus(
  row: Pick<Keyword, "id" | "siteId" | "keyword">,
  status: string | undefined,
  shelvedReason: string | null | undefined,
): Promise<void> {
  if (status === undefined) return;
  try {
    if (status === "shelved") {
      await addExclusion({
        siteId: row.siteId,
        phrase: row.keyword,
        reason: shelvedReason ?? null,
        source: "keyword",
        sourceId: row.id,
      });
    } else {
      await removeExclusionByPhrase(row.siteId, row.keyword);
    }
  } catch (e) {
    console.warn("keywords: exclusion sync failed", e);
  }
}

export async function updateKeyword(
  id: number,
  patch: { status?: string; shelvedReason?: string | null },
) {
  const db = getDb();
  const setObj = buildStatusSet(patch);
  if (Object.keys(setObj).length === 0) return null;
  const [row] = await db
    .update(keywords)
    .set(setObj)
    .where(eq(keywords.id, id))
    .returning();
  if (row) {
    await syncExclusionForStatus(row, patch.status, patch.shelvedReason);
  }
  return row ?? null;
}

/** Update many keywords at once (bulk approve / shelve / restore). Returns count. */
export async function bulkUpdateKeywords(
  ids: number[],
  patch: { status: string; shelvedReason?: string | null },
): Promise<number> {
  if (!ids.length) return 0;
  const db = getDb();
  const setObj = buildStatusSet(patch);
  const rows = await db
    .update(keywords)
    .set(setObj)
    .where(inArray(keywords.id, ids))
    .returning({ id: keywords.id, siteId: keywords.siteId, keyword: keywords.keyword });
  for (const row of rows) {
    await syncExclusionForStatus(row, patch.status, patch.shelvedReason);
  }
  return rows.length;
}

export async function bulkInsertKeywords(
  siteId: number,
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
    .values(items.map((it) => ({ ...it, siteId, cycleId, runId, status: "researched" })))
    .returning();
}
