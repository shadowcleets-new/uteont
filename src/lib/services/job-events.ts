/**
 * @file job-events.ts
 * @description IP-13 — append-only audit of job status transitions. Every
 * claim / complete / fail writes an immutable event so a job's full lifecycle is
 * forensically legible in the run console. Writes are best-effort (never break a
 * job); reads are defensive (a missing table degrades to an empty timeline).
 */

import { asc, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobEvents, type JobEvent } from "@/lib/db/schema";

/** Record one transition. Best-effort — swallows errors so it can never throw
 *  into the job pipeline (a missing table must not fail a real job). */
export async function recordJobEvent(
  jobId: number,
  fromStatus: string | null,
  toStatus: string,
  reason?: string | null,
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(jobEvents).values({ jobId, fromStatus, toStatus, reason: reason ?? null });
  } catch (e) {
    console.warn("recordJobEvent failed (table may not exist yet)", e);
  }
}

/** The full lifecycle for a job, oldest first. Empty if the table is absent. */
export async function listJobEvents(jobId: number): Promise<JobEvent[]> {
  try {
    const db = getDb();
    return await db
      .select()
      .from(jobEvents)
      .where(eq(jobEvents.jobId, jobId))
      .orderBy(asc(jobEvents.id));
  } catch (e) {
    console.warn("listJobEvents failed (table may not exist yet)", e);
    return [];
  }
}

/**
 * N-15: retention sweep. job_events is append-only and orphaned by the F-027
 * jobs purge, so it grows unbounded. Delete events older than `beforeDate`
 * (the digest cron passes a 30-day cutoff, env-tunable). Best-effort — a
 * missing table or DB error returns 0 rather than failing the cron.
 */
export async function purgeOldJobEvents(beforeDate: Date): Promise<number> {
  try {
    const db = getDb();
    const result = await db.delete(jobEvents).where(lt(jobEvents.at, beforeDate));
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  } catch (e) {
    console.warn("purgeOldJobEvents failed (table may not exist yet)", e);
    return 0;
  }
}
