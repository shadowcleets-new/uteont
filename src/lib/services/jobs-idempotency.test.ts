import { describe, it, expect } from "vitest";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, runs, jobs, keywords, resultCache, jobEvents, notifications } from "@/lib/db/schema";
import { createSite } from "./sites";
import { enqueueJob, completeJob, failJob, dispatchAgentJob } from "./jobs";

// N-01 (job-lifecycle idempotency) + N-03 (cached replay must not re-persist).
// Live-DB suite, same idiom as dispatch.test.ts — requires DATABASE_URL.

const rand = () => Math.random().toString(36).slice(2, 8);

const newSite = () =>
  createSite({
    key: `idem-${rand()}`, name: "I", domain: "https://idem.com", locale: "en-US",
    cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
  });

describe("job lifecycle idempotency (live DB)", () => {
  it("completeJob is idempotent — a re-delivered completion does not duplicate side-effects (N-01)", { timeout: 30000 }, async () => {
    const db = getDb();
    const testStart = new Date();
    const site = await newSite();
    let jobId = 0;
    try {
      const job = await enqueueJob({ agentKey: "qa", siteId: site.id, payload: {} });
      jobId = job.id;

      await completeJob(jobId, { ok: true });
      const runs1 = await db.select().from(runs).where(eq(runs.jobId, jobId));
      expect(runs1.length).toBe(1);
      const [j1] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      expect(j1.status).toBe("done");

      // Worker's /complete response was lost; it re-delivers the same completion.
      await completeJob(jobId, { ok: true });
      const runs2 = await db.select().from(runs).where(eq(runs.jobId, jobId));
      expect(runs2.length).toBe(1); // no duplicate runs row
    } finally {
      await db.delete(runs).where(eq(runs.siteId, site.id));
      if (jobId) await db.delete(jobEvents).where(eq(jobEvents.jobId, jobId));
      await db.delete(jobs).where(eq(jobs.siteId, site.id));
      await db.delete(notifications).where(and(eq(notifications.subject, "qa completed"), gte(notifications.createdAt, testStart)));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });

  it("failJob does not resurrect a job that already completed (N-01)", { timeout: 30000 }, async () => {
    const db = getDb();
    const site = await newSite();
    let jobId = 0;
    try {
      const job = await enqueueJob({ agentKey: "qa", siteId: site.id, payload: {} });
      jobId = job.id;
      await completeJob(jobId, { ok: true });

      // The lost-response path: worker reports a (retryable) failure for a job the
      // server already marked done. It must NOT flip back to 'queued'.
      await failJob(jobId, "lost response / timeout", true);
      const [j] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      expect(j.status).toBe("done");

      const failRuns = (await db.select().from(runs).where(eq(runs.jobId, jobId))).filter((r) => r.status === "failure");
      expect(failRuns.length).toBe(0); // no failure run written for the stale retry
    } finally {
      await db.delete(runs).where(eq(runs.siteId, site.id));
      if (jobId) await db.delete(jobEvents).where(eq(jobEvents.jobId, jobId));
      await db.delete(jobs).where(eq(jobs.siteId, site.id));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });

  it("a cached replay does not re-insert domain rows (N-03)", { timeout: 30000 }, async () => {
    delete process.env.RESULT_DEDUP; // dedup on
    const db = getDb();
    const testStart = new Date();
    const site = await newSite();
    let jobId = 0;
    const payload = {
      topic: `t-${rand()}`,
      site: { domain: "https://idem.com", locale: "en-US", niche: null, audience: null, voiceGuide: null, contentPillars: [], bannedPhrases: [] },
    };
    try {
      // 1. MISS -> enqueued
      const d1 = await dispatchAgentJob({ agentKey: "research", siteId: site.id, payload: { ...payload } });
      expect(d1.mode).toBe("enqueued");
      if (d1.mode !== "enqueued") throw new Error("unreachable");
      jobId = d1.job.id;

      // 2. complete it -> persists exactly one keyword + caches the result
      const result = { keywords: [{ keyword: `kw-${rand()}`, search_volume_estimate: 100, competition_score: 5, source: "test", priority_rank: 1 }] };
      await completeJob(jobId, result);
      const afterComplete = await db.select().from(keywords).where(eq(keywords.siteId, site.id));
      expect(afterComplete.length).toBe(1);

      // 3. HIT -> cached replay (jobId null). Must NOT insert keywords again.
      const d2 = await dispatchAgentJob({ agentKey: "research", siteId: site.id, payload: { ...payload } });
      expect(d2.mode).toBe("cached");
      const afterReplay = await db.select().from(keywords).where(eq(keywords.siteId, site.id));
      expect(afterReplay.length).toBe(1); // unchanged — the replay wrote no new keyword
    } finally {
      await db.delete(keywords).where(eq(keywords.siteId, site.id)); // FK: keywords.runId -> runs, delete first
      await db.delete(runs).where(eq(runs.siteId, site.id));
      if (jobId) await db.delete(jobEvents).where(eq(jobEvents.jobId, jobId));
      await db.delete(jobs).where(eq(jobs.siteId, site.id));
      await db.delete(resultCache).where(eq(resultCache.siteId, site.id));
      await db.delete(notifications).where(and(eq(notifications.subject, "research completed"), gte(notifications.createdAt, testStart)));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });
});
