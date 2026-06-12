import { and, gte, lte, inArray, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywords } from "@/lib/db/schema";
import type { TabularPayload, ExportFilters } from "../types";
import { parseExportDate } from "./keywords-filters";

export async function fetchKeywordsPayload(
  filters: ExportFilters,
): Promise<TabularPayload> {
  const conditions = [];
  // A-11: validate dates (throws on malformed → API answers 400) instead of
  // silently producing an empty export from an Invalid Date.
  const from = parseExportDate(filters.from);
  const to = parseExportDate(filters.to);
  if (from) conditions.push(gte(keywords.createdAt, from));
  if (to) conditions.push(lte(keywords.createdAt, to));
  // A-11: apply the status filter now that keywords.status exists (it was a
  // dead no-op while the column was missing).
  if (filters.statuses?.length) {
    conditions.push(inArray(keywords.status, filters.statuses));
  }

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
