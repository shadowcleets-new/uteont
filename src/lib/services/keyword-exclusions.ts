import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  keywordExclusions,
  type KeywordExclusion,
} from "@/lib/db/schema";

export class ExclusionAlreadyExistsError extends Error {
  readonly siteId: number;
  readonly phrase: string;
  constructor(siteId: number, phrase: string) {
    super(`Exclusion already exists for site ${siteId}: "${phrase}"`);
    this.name = "ExclusionAlreadyExistsError";
    this.siteId = siteId;
    this.phrase = phrase;
  }
}

export interface AddExclusionInput {
  siteId: number;
  phrase: string;
  reason?: string | null;
  source?: "keyword" | "idea" | "article" | "manual";
  sourceId?: number;
}

/**
 * Idempotent capture. The composite unique index on (site_id, LOWER(phrase))
 * collapses case variants — "Credit Card Rewards" and "credit card rewards"
 * occupy the same row. Duplicate writes are no-ops (return the existing
 * row) rather than 409s so the UX never blocks a user who clicks "shelve"
 * twice on the same keyword.
 */
export async function addExclusion(
  input: AddExclusionInput,
): Promise<KeywordExclusion> {
  const phrase = input.phrase.trim();
  if (!phrase) {
    throw new Error("Cannot persist an empty exclusion phrase");
  }
  const db = getDb();
  try {
    const [row] = await db
      .insert(keywordExclusions)
      .values({
        siteId: input.siteId,
        phrase,
        reason: input.reason ?? null,
        source: input.source ?? "keyword",
        sourceId: input.sourceId ?? null,
      })
      .returning();
    return row;
  } catch (e) {
    // drizzle wraps the driver error; the constraint name lives on the
    // cause chain, so collect text from every level before matching.
    let msg = "";
    for (let err: unknown = e; err instanceof Error; err = err.cause) {
      msg += ` ${err.message}`;
    }
    if (
      /keyword_exclusions_site_phrase_unique_idx|duplicate key value/i.test(
        msg,
      )
    ) {
      // Re-fetch the existing row so the caller always gets a real record.
      const [existing] = await db
        .select()
        .from(keywordExclusions)
        .where(
          and(
            eq(keywordExclusions.siteId, input.siteId),
            sql`LOWER(${keywordExclusions.phrase}) = LOWER(${phrase})`,
          ),
        )
        .limit(1);
      if (existing) return existing;
      throw new ExclusionAlreadyExistsError(input.siteId, phrase);
    }
    throw e;
  }
}

export async function listExclusions(
  siteId: number,
  limit = 500,
): Promise<KeywordExclusion[]> {
  const db = getDb();
  return db
    .select()
    .from(keywordExclusions)
    .where(eq(keywordExclusions.siteId, siteId))
    .orderBy(desc(keywordExclusions.id))
    .limit(limit);
}

/** Just the phrases, for prompt payloads and the ingestion filter. */
export async function listExclusionPhrases(
  siteId: number,
  limit = 500,
): Promise<string[]> {
  const rows = await listExclusions(siteId, limit);
  return rows.map((r) => r.phrase);
}

export async function removeExclusion(id: number): Promise<void> {
  const db = getDb();
  await db.delete(keywordExclusions).where(eq(keywordExclusions.id, id));
}

/**
 * Release leg of the closed loop: restoring a shelved keyword lifts its
 * exclusion (case-insensitive match), otherwise the restored keyword
 * would be re-blocked at the next ingestion — a contradiction.
 */
export async function removeExclusionByPhrase(
  siteId: number,
  phrase: string,
): Promise<void> {
  const trimmed = phrase.trim();
  if (!trimmed) return;
  const db = getDb();
  await db
    .delete(keywordExclusions)
    .where(
      and(
        eq(keywordExclusions.siteId, siteId),
        sql`LOWER(${keywordExclusions.phrase}) = LOWER(${trimmed})`,
      ),
    );
}

/**
 * Extract a short head phrase from a longer string. Used when capturing
 * a rejection: for an idea angle like "How sourdough starter goes
 * dormant — a 2026 chemistry deep-dive", we want "How sourdough starter
 * goes dormant" persisted, not the whole sentence. Anchors on em-dash,
 * colon, or vertical-bar separators and otherwise takes the first six
 * meaningful words.
 */
export function extractHeadPhrase(input: string): string {
  if (!input) return "";
  const collapsed = input.replace(/\s+/g, " ").trim();
  const separator = collapsed.search(/[–—\-:|]\s/);
  let head = separator > 0 ? collapsed.slice(0, separator) : collapsed;
  const words = head.split(" ").filter(Boolean);
  if (words.length > 8) head = words.slice(0, 6).join(" ");
  return head.replace(/[\s–—\-:|"'.,;]+$/g, "").trim();
}
