/**
 * Explicit Gemini context caching for stable, reused system prompts (the
 * Director's). Creates a `cachedContents` resource and reuses its name across
 * calls, fronted by an in-memory map (warm on Vercel Fluid Compute) and a
 * kv_settings registry (survives cold starts).
 *
 * Free tier commonly rejects explicit cache creation and stable prompts may
 * fall under the per-model minimum token threshold — both degrade silently to
 * null, and the caller falls back to an inline systemInstruction.
 *
 * Kill-switch: GEMINI_CONTEXT_CACHE=off.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";
import { logEvent } from "@/lib/observability/logger";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/cachedContents";

// Gemini rejects cachedContents below a per-model minimum (~1k+ tokens). Skip
// proactively so we never POST a guaranteed-reject every Director turn; free
// implicit caching covers small prompts. ~4 chars/token => 4096 chars ~ 1k tok.
const MIN_SYSTEM_INSTRUCTION_CHARS = 4096;

interface CacheRegistryEntry {
  name: string;
  expiresAtMs: number;
}

const memCache = new Map<string, CacheRegistryEntry>();

function cacheEnabled(): boolean {
  return process.env.GEMINI_CONTEXT_CACHE?.trim().toLowerCase() !== "off";
}

function keyHash(model: string, systemInstruction: string): string {
  return createHash("sha256")
    .update(`${model} ${systemInstruction}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Return a usable cachedContents name, or null if caching is off/unavailable.
 * Never throws.
 */
export async function getOrCreateCachedContent(opts: {
  model: string;
  systemInstruction: string;
  ttlSeconds?: number;
}): Promise<string | null> {
  if (!cacheEnabled()) return null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // Sub-threshold prompts can't be cached — fall back to inline (no I/O).
  if (opts.systemInstruction.length < MIN_SYSTEM_INSTRUCTION_CHARS) return null;

  const ttl = opts.ttlSeconds ?? 3600;
  const hash = keyHash(opts.model, opts.systemInstruction);
  const kvKey = `gemini.cache.${hash}`;
  const now = Date.now();

  // 1. In-memory front (warm instance reuse)
  const mem = memCache.get(hash);
  if (mem && mem.expiresAtMs > now + 60_000) return mem.name;

  // 2. DB registry
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(kvSettings)
      .where(eq(kvSettings.key, kvKey))
      .limit(1);
    const val = row?.value as CacheRegistryEntry | undefined;
    if (val && typeof val.name === "string" && val.expiresAtMs > now + 60_000) {
      memCache.set(hash, val);
      return val.name;
    }
  } catch (e) {
    console.warn("gemini-cache: registry read failed", e);
  }

  // 3. Create a new cachedContents resource
  try {
    const modelPath = opts.model.startsWith("models/") ? opts.model : `models/${opts.model}`;
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelPath,
        systemInstruction: { parts: [{ text: opts.systemInstruction }] },
        ttl: `${ttl}s`,
      }),
    });
    if (!res.ok) {
      // Free tier / under-minimum-tokens — degrade silently to inline.
      logEvent({ kind: "gemini.cache.skip", model: opts.model, httpStatus: res.status });
      return null;
    }
    const data = (await res.json()) as { name?: string };
    if (!data.name) return null;
    const entry: CacheRegistryEntry = { name: data.name, expiresAtMs: now + ttl * 1000 };
    memCache.set(hash, entry);
    try {
      const db = getDb();
      await db
        .insert(kvSettings)
        .values({ key: kvKey, value: entry })
        .onConflictDoUpdate({ target: kvSettings.key, set: { value: entry, updatedAt: new Date() } });
    } catch (e) {
      console.warn("gemini-cache: registry write failed", e);
    }
    logEvent({ kind: "gemini.cache.create", model: opts.model, name: data.name });
    return data.name;
  } catch (e) {
    console.warn("gemini-cache: create failed", e);
    return null;
  }
}
