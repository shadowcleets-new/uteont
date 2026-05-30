import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, resultCache } from "@/lib/db/schema";
import { createSite } from "./sites";
import {
  computeDedupeKey,
  isDedupeEligible,
  isCacheableResult,
  storeResult,
  lookupResult,
  bumpHitCount,
} from "./result-cache";

const rand = () => Math.random().toString(36).slice(2, 8);

const ORIGINAL_DEDUP = process.env.RESULT_DEDUP;
afterEach(() => {
  if (ORIGINAL_DEDUP === undefined) delete process.env.RESULT_DEDUP;
  else process.env.RESULT_DEDUP = ORIGINAL_DEDUP;
});

const sitePayload = (over: Record<string, unknown> = {}) => ({
  seeds: ["a", "b"],
  site: { domain: "https://x.com", locale: "en-US", niche: "demo", voiceGuide: "Warm", contentPillars: ["p1"], bannedPhrases: [] },
  ...over,
});

describe("computeDedupeKey", () => {
  it("is stable regardless of object key order", () => {
    const a = computeDedupeKey("research", 1, { x: 1, y: 2, site: { locale: "en" } });
    const b = computeDedupeKey("research", 1, { y: 2, site: { locale: "en" }, x: 1 });
    expect(a).toBe(b);
  });

  it("ignores volatile keys (_directorContext, forceFresh, _dedupeKey)", () => {
    const base = computeDedupeKey("research", 1, sitePayload());
    const withVolatile = computeDedupeKey("research", 1, {
      ...sitePayload(),
      _directorContext: { conversationId: 99 },
      forceFresh: true,
      _dedupeKey: "stale",
    });
    expect(base).toBe(withVolatile);
  });

  it("changes when a site profile field (voiceGuide) changes", () => {
    const a = computeDedupeKey("research", 1, sitePayload());
    const b = computeDedupeKey("research", 1, sitePayload({ site: { domain: "https://x.com", locale: "en-US", niche: "demo", voiceGuide: "Terse", contentPillars: ["p1"], bannedPhrases: [] } }));
    expect(a).not.toBe(b);
  });

  it("respects array order (different order => different key)", () => {
    const a = computeDedupeKey("research", 1, { seeds: ["a", "b"] });
    const b = computeDedupeKey("research", 1, { seeds: ["b", "a"] });
    expect(a).not.toBe(b);
  });

  it("changes when siteId changes", () => {
    expect(computeDedupeKey("research", 1, sitePayload())).not.toBe(
      computeDedupeKey("research", 2, sitePayload()),
    );
  });
});

describe("isDedupeEligible", () => {
  it("is true for worker agents with a positive TTL", () => {
    delete process.env.RESULT_DEDUP;
    expect(isDedupeEligible("research")).toBe(true);
    expect(isDedupeEligible("content-writing")).toBe(true);
  });

  it("is false for fn agents with TTL 0 (qa, seo-optimization)", () => {
    delete process.env.RESULT_DEDUP;
    expect(isDedupeEligible("qa")).toBe(false);
    expect(isDedupeEligible("seo-optimization")).toBe(false);
  });

  it("is false for everything when RESULT_DEDUP=off", () => {
    process.env.RESULT_DEDUP = "off";
    expect(isDedupeEligible("research")).toBe(false);
  });
});

describe("isCacheableResult", () => {
  it("requires non-empty keywords for research", () => {
    expect(isCacheableResult("research", { keywords: [{ keyword: "k" }] })).toBe(true);
    expect(isCacheableResult("research", { keywords: [] })).toBe(false);
  });
  it("requires title and body for content-writing", () => {
    expect(isCacheableResult("content-writing", { title: "t", body: "b" })).toBe(true);
    expect(isCacheableResult("content-writing", { title: "t" })).toBe(false);
  });
  it("requires a body for backlink", () => {
    expect(isCacheableResult("backlink", { body: "draft" })).toBe(true);
    expect(isCacheableResult("backlink", {})).toBe(false);
  });
});

describe("store / lookup / bump (live DB)", () => {
  it("round-trips a cache row and increments hitCount", { timeout: 15000 }, async () => {
    const db = getDb();
    const site = await createSite({
      key: `cache-${rand()}`, name: "C", domain: "https://c.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const dedupeKey = `test-${rand()}-${rand()}`;
    try {
      await storeResult({
        dedupeKey, agentKey: "research", siteId: site.id,
        result: { keywords: [{ keyword: "x" }] }, sourceRunId: null, sourceJobId: 123,
      });
      const hit = await lookupResult(dedupeKey);
      expect(hit).not.toBeNull();
      expect(hit!.sourceJobId).toBe(123);
      expect(Array.isArray((hit!.result as { keywords?: unknown[] }).keywords)).toBe(true);

      await bumpHitCount(hit!.id);
      const [row] = await db.select().from(resultCache).where(eq(resultCache.dedupeKey, dedupeKey)).limit(1);
      expect(row.hitCount).toBe(1);
    } finally {
      await db.delete(resultCache).where(eq(resultCache.dedupeKey, dedupeKey));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });

  it("treats an expired row as a miss", { timeout: 15000 }, async () => {
    const db = getDb();
    const site = await createSite({
      key: `cache-${rand()}`, name: "C", domain: "https://c.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const dedupeKey = `test-${rand()}-${rand()}`;
    try {
      // Insert directly with a past expiry (storeResult always sets a future one).
      await db.insert(resultCache).values({
        dedupeKey, agentKey: "research", siteId: site.id,
        result: { keywords: [{ keyword: "x" }] }, hitCount: 0,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await lookupResult(dedupeKey)).toBeNull();
    } finally {
      await db.delete(resultCache).where(eq(resultCache.dedupeKey, dedupeKey));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });
});
