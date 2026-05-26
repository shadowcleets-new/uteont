import { and, gte, lte, inArray, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import type { TabularPayload, ExportFilters } from "../types";

export async function fetchRunsPayload(
  filters: ExportFilters,
): Promise<TabularPayload> {
  const conditions = [];
  if (filters.from)     conditions.push(gte(runs.startedAt, new Date(filters.from)));
  if (filters.to)       conditions.push(lte(runs.startedAt, new Date(filters.to)));
  if (filters.statuses?.length) conditions.push(inArray(runs.status, filters.statuses));

  let rows: Array<typeof runs.$inferSelect> = [];
  try {
    const db = getDb();
    rows = await db
      .select()
      .from(runs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(runs.startedAt))
      .limit(5000);
  } catch {
    rows = [];
  }

  return {
    kind: "tabular",
    title: "UTEONT run history",
    generatedAt: new Date().toISOString(),
    filterSummary: summarize(filters),
    columns: [
      { key: "id",         label: "ID" },
      { key: "subjectKey", label: "Subject" },
      { key: "category",   label: "Category" },
      { key: "action",     label: "Action" },
      { key: "status",     label: "Status" },
      { key: "startedAt",  label: "Started" },
      { key: "duration",   label: "Duration (s)" },
    ],
    rows: rows.map((r) => {
      const started = r.startedAt as Date | null;
      const finished = r.finishedAt as Date | null;
      const dur = started && finished
        ? Math.round((finished.getTime() - started.getTime()) / 1000)
        : "";
      return {
        id:         r.id,
        subjectKey: r.subjectKey,
        category:   r.category,
        action:     r.action,
        status:     r.status,
        startedAt:  started ? started.toISOString() : "",
        duration:   dur,
      };
    }),
  };
}

function summarize(f: ExportFilters): string {
  const parts: string[] = [];
  if (f.from) parts.push(`from ${f.from}`);
  if (f.to) parts.push(`to ${f.to}`);
  if (f.statuses?.length) parts.push(`status in [${f.statuses.join(",")}]`);
  return parts.length ? parts.join(" · ") : "no filters";
}
