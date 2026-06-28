import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobEvents } from "@/lib/db/schema";
import { recordJobEvent, listJobEvents, purgeOldJobEvents } from "./job-events";

// N-15: the digest cron's retention sweep must delete job_events past the
// window while leaving recent events intact. Live-DB suite, same idiom as
// jobs-idempotency.test.ts — requires DATABASE_URL.

const randJobId = () => 900_000_000 + Math.floor(Math.random() * 90_000_000);

describe("purgeOldJobEvents retention sweep (live DB, N-15)", () => {
  it("deletes events older than the cutoff and keeps recent ones", { timeout: 30000 }, async () => {
    const db = getDb();
    const jobId = randJobId();
    try {
      // One stale event (well before the cutoff) + one recent event (now).
      const stale = new Date(Date.now() - 60 * 24 * 3600 * 1000); // 60 days ago
      await db.insert(jobEvents).values({ jobId, fromStatus: null, toStatus: "queued", at: stale });
      await recordJobEvent(jobId, "queued", "running"); // defaults `at` to now

      const before = await listJobEvents(jobId);
      expect(before.length).toBe(2);

      // Sweep everything older than 30 days — only the stale row should go.
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const purged = await purgeOldJobEvents(cutoff);
      expect(purged).toBe(1);

      const after = await listJobEvents(jobId);
      expect(after.length).toBe(1);
      expect(after[0].toStatus).toBe("running");
    } finally {
      await db.delete(jobEvents).where(eq(jobEvents.jobId, jobId));
    }
  });
});
