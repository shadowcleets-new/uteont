import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db/client";
import { jobs, runs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

import { enqueueJob, completeJob, failJob, getJob } from "./jobs";
import { createSite } from "./sites";

// Live-DB test (shared Neon). Uses random fixtures; the standard 15s timeout.
const fixtureKey = () => `test-${Math.random().toString(36).slice(2, 8)}`;

async function makeSite() {
  return createSite({
    key: fixtureKey(),
    name: "Jobs Idempotency Test",
    domain: "https://jobs-idem-test.invalid",
    locale: "en-US",
    cmsPlatform: "none",
    contentPillars: [],
    bannedPhrases: [],
    defaultCategories: [],
  });
}

describe("completeJob idempotency (A-04)", () => {
  it("does not double-apply side-effects when called twice for the same job", { timeout: 15000 }, async () => {
    const db = getDb();
    const site = await makeSite();
    const job = await enqueueJob({ agentKey: "technical-seo", siteId: site.id, payload: {} });

    // First completion succeeds and writes exactly one runs row.
    await completeJob(job.id, { ok: true, score: 90 });
    // Second completion (simulating a worker retry after a timed-out HTTP call)
    // must be a no-op — no second runs row, no re-persist.
    await completeJob(job.id, { ok: true, score: 90 });

    const runRows = await db.select().from(runs).where(eq(runs.jobId, job.id));
    expect(runRows).toHaveLength(1);
  });
});

describe("failJob does not resurrect a completed job (A-04)", () => {
  it("ignores a late failJob for an already-done job (no requeue)", { timeout: 15000 }, async () => {
    const site = await makeSite();
    const job = await enqueueJob({ agentKey: "technical-seo", siteId: site.id, payload: {} });

    await completeJob(job.id, { ok: true });
    // The worker's complete_job HTTP call timed out after commit, so it calls
    // fail_job(retry=true). That must NOT flip a done job back to queued.
    await failJob(job.id, "late failure after a timed-out complete", true);

    const after = await getJob(job.id);
    expect(after?.status).toBe("done");
  });
});
