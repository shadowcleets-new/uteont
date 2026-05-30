/**
 * Result dedup cache.
 *
 * A finished agent result is stored keyed by a deterministic hash of the
 * request (agentKey + siteId + site-profile signature + canonicalized
 * payload). A later enqueue with the same key replays the stored result
 * (see services/jobs.ts dispatchAgentJob) instead of running the worker.
 *
 * TTL is per-agent. TTL 0 disables dedup for that agent (e.g. the
 * deterministic fn agents, where inline recompute is cheaper than replay).
 */

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { resultCache } from "@/lib/db/schema";

// Per-agent TTL in seconds. 0 = dedup disabled for that agent.
export const TTL_SECONDS_BY_AGENT: Record<string, number> = {
  research: 7 * 24 * 3600,
  "idea-generation": 7 * 24 * 3600,
  "content-writing": 30 * 24 * 3600,
  backlink: 7 * 24 * 3600,
  qa: 0,
  "seo-optimization": 0,
};

/** Global kill-switch. RESULT_DEDUP=off disables all dedup. */
export function dedupEnabled(): boolean {
  return process.env.RESULT_DEDUP?.trim().toLowerCase() !== "off";
}

/** True only when dedup is on AND this agent has a positive TTL. */
export function isDedupeEligible(agentKey: string): boolean {
  if (!dedupEnabled()) return false;
  const ttl = TTL_SECONDS_BY_AGENT[agentKey];
  return typeof ttl === "number" && ttl > 0;
}

// Keys that must not affect the dedupe identity.
const VOLATILE_KEYS = new Set(["_directorContext", "_dedupeKey", "forceFresh", "site"]);

// Site-profile fields that DO affect output (so editing them invalidates cache).
const PROFILE_FIELDS = [
  "locale",
  "domain",
  "niche",
  "audience",
  "voiceGuide",
  "contentPillars",
  "bannedPhrases",
] as const;

/** Recursively sort object keys; preserve array order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = canonicalize(src[k]);
    return out;
  }
  return value;
}

function profileSignature(payload: Record<string, unknown>): string {
  const site = (payload.site ?? {}) as Record<string, unknown>;
  const sig: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) sig[f] = site[f] ?? null;
  return JSON.stringify(canonicalize(sig));
}

export function computeDedupeKey(
  agentKey: string,
  siteId: number,
  payload: Record<string, unknown>,
): string {
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!VOLATILE_KEYS.has(k)) stripped[k] = v;
  }
  const profileSig = profileSignature(payload);
  const canonical = JSON.stringify(canonicalize(stripped));
  const material = `${agentKey} ${siteId} ${profileSig} ${canonical}`;
  return createHash("sha256").update(material).digest("hex");
}

/** Decide whether a result is worth caching (non-empty, useful output only). */
export function isCacheableResult(
  agentKey: string,
  result: Record<string, unknown>,
): boolean {
  switch (agentKey) {
    case "research":
      return Array.isArray(result.keywords) && result.keywords.length > 0;
    case "idea-generation":
      return Array.isArray(result.ideas) && result.ideas.length > 0;
    case "content-writing":
      return Boolean(result.title) && Boolean(result.body);
    case "backlink":
      return Boolean(result.body) || Boolean((result as { draft?: unknown }).draft);
    default:
      return false;
  }
}

export interface CachedLookup {
  id: number;
  result: Record<string, unknown>;
  sourceRunId: number | null;
  sourceJobId: number | null;
}

/** Look up a live (non-expired) cache row. Expired rows are treated as misses. */
export async function lookupResult(dedupeKey: string): Promise<CachedLookup | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(resultCache)
    .where(eq(resultCache.dedupeKey, dedupeKey))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt instanceof Date && row.expiresAt.getTime() <= Date.now()) return null;
  return {
    id: row.id,
    result: row.result as Record<string, unknown>,
    sourceRunId: row.sourceRunId ?? null,
    sourceJobId: row.sourceJobId ?? null,
  };
}

/** Upsert a cache row. No-op if the agent's TTL is 0. */
export async function storeResult(input: {
  dedupeKey: string;
  agentKey: string;
  siteId: number;
  result: Record<string, unknown>;
  sourceRunId?: number | null;
  sourceJobId?: number | null;
}): Promise<void> {
  const ttl = TTL_SECONDS_BY_AGENT[input.agentKey] ?? 0;
  if (ttl <= 0) return;
  const db = getDb();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await db
    .insert(resultCache)
    .values({
      dedupeKey: input.dedupeKey,
      agentKey: input.agentKey,
      siteId: input.siteId,
      result: input.result,
      sourceRunId: input.sourceRunId ?? null,
      sourceJobId: input.sourceJobId ?? null,
      hitCount: 0,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: resultCache.dedupeKey,
      set: {
        result: input.result,
        sourceRunId: input.sourceRunId ?? null,
        sourceJobId: input.sourceJobId ?? null,
        expiresAt,
      },
    });
}

export async function bumpHitCount(id: number): Promise<void> {
  const db = getDb();
  await db
    .update(resultCache)
    .set({ hitCount: sql`${resultCache.hitCount} + 1` })
    .where(eq(resultCache.id, id));
}
