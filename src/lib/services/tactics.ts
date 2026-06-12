/**
 * @file tactics.ts
 * @description Tactics knowledge base (LO-61/62/63). Persists rows scraped by
 * the Tactics Scraper / NotebookLM path and exposes reads for the surfaces
 * that consume them (the /tactics page) and for planning agents (Director,
 * Idea Generation) that ground recommendations in current community practice.
 */

import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { tactics, type Tactic } from "@/lib/db/schema";

const VALID_SOURCE_TYPES = new Set([
  "reddit", "hn", "forum", "blog", "x", "other", "notebooklm-derived",
]);

export interface ScrapedTactic {
  sourceUrl: string;
  sourceType: string;
  title: string;
  body: string;
  tags?: string[];
  score?: number | null;
}

/** Coerce a raw scraped item into a valid row, or null if unusable. Pure. */
export function normalizeTactic(raw: unknown): ScrapedTactic | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sourceUrl = String(r.sourceUrl ?? "").trim();
  const title = String(r.title ?? "").trim();
  const body = String(r.body ?? "").trim();
  if (!sourceUrl || !title || !body) return null;
  const st = String(r.sourceType ?? "other").trim();
  return {
    sourceUrl: sourceUrl.slice(0, 2000),
    sourceType: VALID_SOURCE_TYPES.has(st) ? st : "other",
    title: title.slice(0, 300),
    body: body.slice(0, 4000),
    tags: Array.isArray(r.tags) ? r.tags.map(String).slice(0, 12) : undefined,
    score: typeof r.score === "number" ? r.score : null,
  };
}

/** Extract + normalize the tactics array from a worker result blob. Pure. */
export function tacticsFromResult(result: Record<string, unknown>): ScrapedTactic[] {
  const arr = Array.isArray(result.tactics) ? result.tactics : [];
  return arr.map(normalizeTactic).filter((t): t is ScrapedTactic => t !== null);
}

export async function persistTactics(
  siteId: number | null,
  items: ScrapedTactic[],
  addedBy = "agent",
): Promise<number> {
  if (!items.length) return 0;
  const db = getDb();
  const rows = await db
    .insert(tactics)
    .values(
      items.map((t) => ({
        siteId,
        sourceUrl: t.sourceUrl,
        sourceType: t.sourceType,
        title: t.title,
        body: t.body,
        tags: t.tags ?? null,
        score: t.score ?? null,
        addedBy,
      })),
    )
    .returning({ id: tactics.id });
  return rows.length;
}

export interface ListTacticsOptions {
  siteId?: number | null;
  sourceType?: string;
  limit?: number;
}

export async function listTactics(opts: ListTacticsOptions = {}): Promise<Tactic[]> {
  const db = getDb();
  const conds = [];
  if (opts.siteId != null) conds.push(eq(tactics.siteId, opts.siteId));
  if (opts.sourceType) conds.push(eq(tactics.sourceType, opts.sourceType));
  return db
    .select()
    .from(tactics)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(tactics.scrapedAt))
    .limit(Math.min(opts.limit ?? 100, 500));
}

/**
 * A compact digest of recent tactics for planning prompts (Director,
 * Idea Generation). Returns up to `n` short "title — first sentence" lines.
 */
export async function recentTacticsDigest(siteId: number | null, n = 8): Promise<string[]> {
  try {
    const rows = await listTactics({ siteId, limit: n });
    return rows.map((r) => {
      const firstSentence = r.body.split(/(?<=[.!?])\s/)[0]?.slice(0, 160) ?? "";
      return `${r.title} — ${firstSentence}`;
    });
  } catch {
    return [];
  }
}
