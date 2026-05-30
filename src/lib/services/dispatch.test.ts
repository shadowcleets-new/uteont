import { describe, it, expect, afterEach } from "vitest";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, runs, jobs, resultCache, notifications } from "@/lib/db/schema";
import { createSite } from "./sites";
import { dispatchAgentJob, completeJob } from "./jobs";
import { computeDedupeKey, lookupResult, storeResult } from "./result-cache";

const rand = () => Math.random().toString(36).slice(2, 8);

const ORIGINAL_DEDUP = process.env.RESULT_DEDUP;
afterEach(() => {
  if (ORIGINAL_DEDUP === undefined) delete process.env.RESULT_DEDUP;
  else process.env.RESULT_DEDUP = ORIGINAL_DEDUP;
});

describe("dispatchAgentJob + completeJob dedup round-trip (live DB)", () => {
  it("misses then replays then bypasses with forceFresh", { timeout: 30000 }, async () => {
    delete process.env.RESULT_DEDUP; // dedup on
    const db = getDb();
    const testStart = new Date();
    const site = await createSite({
      key: `disp-${rand()}`, name: "D", domain: "https://d.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const payload = {
      targetSite: "example.org",
      context: "ctx",
      site: { domain: "https://d.com", locale: "en-US", niche: null, audience: null, voiceGuide: null, contentPillars: [], bannedPhrases: [] },
    };
    const expectedKey = computeDedupeKey("backlink", site.id, payload);
    try {
      // 1. MISS -> enqueued, _dedupeKey stamped onto the job payload
      const d1 = await dispatchAgentJob({ agentKey: "backlink", siteId: site.id, payload: { ...payload } });
      expect(d1.mode).toBe("enqueued");
      if (d1.mode !== "enqueued") throw new Error("unreachable");
      expect((d1.job.payload as Record<string, unknown>)._dedupeKey).toBe(expectedKey);

      // 2. completeJob stores a cacheable result
      await completeJob(d1.job.id, { body: "outreach draft", target_site: "example.org" });
      const stored = await lookupResult(expectedKey);
      expect(stored).not.toBeNull();
      expect((stored!.result as { body?: string }).body).toBe("outreach draft");

      // 3. HIT -> cached replay (no new job), same body
      const d2 = await dispatchAgentJob({ agentKey: "backlink", siteId: site.id, payload: { ...payload } });
      expect(d2.mode).toBe("cached");
      if (d2.mode !== "cached") throw new Error("unreachable");
      expect((d2.result as { body?: string }).body).toBe("outreach draft");

      // 4. forceFresh -> bypass cache, enqueue again
      const d3 = await dispatchAgentJob({ agentKey: "backlink", siteId: site.id, payload: { ...payload }, forceFresh: true });
      expect(d3.mode).toBe("enqueued");
    } finally {
      // Clean up every row this test created (RESTRICT FKs: runs/jobs before site).
      await db.delete(runs).where(eq(runs.siteId, site.id));
      await db.delete(jobs).where(eq(jobs.siteId, site.id));
      await db.delete(resultCache).where(eq(resultCache.siteId, site.id));
      await db.delete(notifications).where(
        and(eq(notifications.subject, "backlink completed"), gte(notifications.createdAt, testStart)),
      );
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });

  it("RESULT_DEDUP=off and TTL-0 agents bypass the cache", { timeout: 30000 }, async () => {
    const db = getDb();
    const site = await createSite({
      key: `disp2-${rand()}`, name: "D2", domain: "https://d2.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const payload = {
      targetSite: "e.org",
      context: "c",
      site: { domain: "https://d2.com", locale: "en-US", niche: null, audience: null, voiceGuide: null, contentPillars: [], bannedPhrases: [] },
    };
    const key = computeDedupeKey("backlink", site.id, payload);
    try {
      // Seed a live cache row, then prove the kill-switch ignores it.
      await storeResult({ dedupeKey: key, agentKey: "backlink", siteId: site.id, result: { body: "seed" }, sourceJobId: 1 });
      process.env.RESULT_DEDUP = "off";
      const off = await dispatchAgentJob({ agentKey: "backlink", siteId: site.id, payload: { ...payload } });
      expect(off.mode).toBe("enqueued");
      delete process.env.RESULT_DEDUP;

      // qa has TTL 0 (dedup disabled) -> always enqueues, never replays.
      const qa = await dispatchAgentJob({ agentKey: "qa", siteId: site.id, payload: { article: "x" } });
      expect(qa.mode).toBe("enqueued");
    } finally {
      await db.delete(jobs).where(eq(jobs.siteId, site.id));
      await db.delete(resultCache).where(eq(resultCache.siteId, site.id));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });
});
