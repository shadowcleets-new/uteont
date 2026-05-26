import { and, gte, lte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywords } from "@/lib/db/schema";
import type { TabularPayload, ExportFilters } from "../types";

export async function fetchKeywordsPayload(
  filters: ExportFilters,
): Promise<TabularPayload> {
  const conditions = [];
  if (filters.from) conditions.push(gte(keywords.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(keywords.createdAt, new Date(filters.to)));
  // status filter is intentionally a no-op here — keywords table doesn't
  // have a status column yet (will when approval flow lands). Carrying
  // it in the API shape so the UI doesn't need to change later.

  let rows: Array<typeof keywords.$inferSelect> = [];
  try {
    const db = getDb();
    rows = await db
      .select()
      .from(keywords)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(keywords.priorityRank));
  } catch {
    // DB not provisioned yet — return empty payload with headers so the
    // export still produces a valid (empty) file.
    rows = [];
  }

  return {
    kind: "tabular",
    title: "UTEONT keywords",
    generatedAt: new Date().toISOString(),
    filterSummary: summarize(filters),
    columns: [
      { key: "priorityRank",         label: "Rank" },
      { key: "keyword",              label: "Keyword" },
      { key: "searchVolumeEstimate", label: "Volume (est)" },
      { key: "competitionScore",     label: "Competition" },
      { key: "source",               label: "Source" },
      { key: "createdAt",            label: "Discovered" },
    ],
    rows: rows.map((r) => ({
      priorityRank:         r.priorityRank,
      keyword:              r.keyword,
      searchVolumeEstimate: r.searchVolumeEstimate,
      competitionScore:     r.competitionScore,
      source:               r.source,
      createdAt:            r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt),
    })),
  };
}

function summarize(f: ExportFilters): string {
  const parts: string[] = [];
  if (f.from) parts.push(`from ${f.from}`);
  if (f.to) parts.push(`to ${f.to}`);
  if (f.statuses?.length) parts.push(`status in [${f.statuses.join(",")}]`);
  return parts.length ? parts.join(" · ") : "no filters";
}
