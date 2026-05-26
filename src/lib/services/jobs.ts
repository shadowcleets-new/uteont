import { and, eq, inArray, sql, desc, asc, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, runs, keywords } from "@/lib/db/schema";

export interface EnqueueJobInput {
  agentKey: string;
  payload: Record<string, unknown>;
  cycleId?: number;
  priority?: number;
  maxAttempts?: number;
}

export async function enqueueJob(input: EnqueueJobInput) {
  const db = getDb();
  const [row] = await db
    .insert(jobs)
    .values({
      agentKey: input.agentKey,
      payload: input.payload,
      cycleId: input.cycleId,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      status: "queued",
    })
    .returning();
  return row;
}

/**
 * Atomically claim one queued job for the worker. Uses
 * `SELECT ... FOR UPDATE SKIP LOCKED`-style semantics via a CTE
 * (Neon HTTP supports it).
 */
export async function claimNextJob(workerId: string, agentKeys: string[]) {
  const db = getDb();

  // Pick the highest-priority oldest queued job for an allowed agent.
  // Raw atomic UPDATE ... RETURNING with a subselect; alias snake_case
  // columns to the Drizzle-side camelCase names so the JSON response
  // matches the typed schema (workers consume `agentKey`, not `agent_key`).
  const result = await db.execute(sql`
    UPDATE jobs
    SET
      status       = 'claimed',
      claimed_by   = ${workerId},
      claimed_at   = NOW(),
      attempts     = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'queued'
        AND agent_key IN (${sql.join(agentKeys.map((k) => sql`${k}`), sql`, `)})
      ORDER BY priority DESC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      agent_key    AS "agentKey",
      cycle_id     AS "cycleId",
      payload,
      status,
      claimed_by   AS "claimedBy",
      claimed_at   AS "claimedAt",
      finished_at  AS "finishedAt",
      result,
      error,
      attempts,
      max_attempts AS "maxAttempts",
      priority,
      created_at   AS "createdAt";
  `);

  const rows = (result as unknown as { rows?: unknown[] }).rows ??
               (Array.isArray(result) ? result : []);
  return (rows[0] as typeof jobs.$inferSelect | undefined) ?? null;
}

/**
 * Complete a job: update job row, write a runs entry, and persist
 * agent-specific output (e.g. research → keywords table).
 */
export async function completeJob(jobId: number, result: Record<string, unknown>) {
  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return;

  // 1. Mark job done
  await db
    .update(jobs)
    .set({
      status: "done",
      finishedAt: new Date(),
      result,
    })
    .where(eq(jobs.id, jobId));

  // 2. Write a runs row (telemetry)
  const startedAt = (job.claimedAt as Date | null) ?? (job.createdAt as Date);
  const [run] = await db
    .insert(runs)
    .values({
      subjectKey: `agent.${job.agentKey}`,
      category: "agent",
      action: `worker:${job.agentKey}`,
      cycleId: job.cycleId,
      jobId: job.id,
      startedAt,
      finishedAt: new Date(),
      status: "success",
      result,
    })
    .returning();

  // 3. Agent-specific persistence
  if (job.agentKey === "research") {
    await persistResearchKeywords(job.cycleId, run.id, result);
  }
}

async function persistResearchKeywords(
  cycleId: number | null,
  runId: number,
  result: Record<string, unknown>,
) {
  const arr = result.keywords;
  if (!Array.isArray(arr) || arr.length === 0) return;
  const db = getDb();
  type Incoming = {
    keyword: string;
    search_volume_estimate: number;
    competition_score: number;
    source: string;
    priority_rank: number;
  };
  const rows = (arr as Incoming[])
    .filter((k) => k && typeof k.keyword === "string")
    .map((k) => ({
      cycleId: cycleId ?? null,
      keyword: k.keyword,
      searchVolumeEstimate: Number(k.search_volume_estimate ?? 0),
      competitionScore: Number(k.competition_score ?? 0),
      source: String(k.source ?? "unknown"),
      priorityRank: Number(k.priority_rank ?? 0),
      runId,
      status: "researched",
    }));
  if (rows.length === 0) return;
  await db.insert(keywords).values(rows);
}

export async function failJob(jobId: number, error: string, retry: boolean) {
  const db = getDb();
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!row) return;
  const shouldRetry = retry && row.attempts < row.maxAttempts;
  await db
    .update(jobs)
    .set({
      status: shouldRetry ? "queued" : "failed",
      claimedBy: null,
      claimedAt: null,
      finishedAt: shouldRetry ? null : new Date(),
      error,
    })
    .where(eq(jobs.id, jobId));

  // Only write a failure run if we're giving up (not retrying)
  if (!shouldRetry) {
    const startedAt = (row.claimedAt as Date | null) ?? (row.createdAt as Date);
    await db.insert(runs).values({
      subjectKey: `agent.${row.agentKey}`,
      category: "agent",
      action: `worker:${row.agentKey}`,
      cycleId: row.cycleId,
      jobId: row.id,
      startedAt,
      finishedAt: new Date(),
      status: "failure",
      error,
    });
  }
}

export async function getJob(id: number) {
  const db = getDb();
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return row ?? null;
}

export async function listJobs(status?: string, limit = 100) {
  const db = getDb();
  if (status) {
    return db
      .select()
      .from(jobs)
      .where(eq(jobs.status, status))
      .orderBy(desc(jobs.id))
      .limit(limit);
  }
  return db.select().from(jobs).orderBy(desc(jobs.id)).limit(limit);
}
