import { and, eq, inArray, sql, desc, asc, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, runs, keywords, ideas, articles } from "@/lib/db/schema";
import { notifyJobSuccess, notifyJobFailure } from "./notify-job";

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

  // 3. Agent-specific persistence (each wrapped — a typed-table issue
  //    must not roll back the runs row or the job 'done' status).
  try {
    if (job.agentKey === "research") {
      await persistResearchKeywords(job.cycleId, run.id, result);
    } else if (job.agentKey === "idea-generation") {
      await persistIdeas(job.cycleId, result);
    } else if (job.agentKey === "content-writing") {
      await persistArticle(job.cycleId, job.payload as Record<string, unknown>, result);
    }
    // outreach/backlink: result captured in runs.result_json; no typed table v1.
  } catch (e) {
    console.warn(`completeJob: agent-persist failed for ${job.agentKey}`, e);
  }

  // 4. Telegram notification (best-effort, never throws into caller)
  try {
    await notifyJobSuccess(job.agentKey, job.id, result);
  } catch (e) {
    console.warn("completeJob: notifyJobSuccess failed", e);
  }

  // 5. If this job was dispatched by the Director, post a system message
  //    into that conversation so the Director can plan the next step.
  try {
    const ctx = (job.payload as Record<string, unknown> | null)?.[
      "_directorContext"
    ] as { conversationId?: number } | undefined;
    if (ctx?.conversationId) {
      const { appendMessage } = await import("./conversations");
      await appendMessage({
        conversationId: ctx.conversationId,
        role: "system",
        content: `${job.agentKey} job ${job.id} completed`,
        payload: { kind: "job-completed", agentKey: job.agentKey, jobId: job.id, result },
      });
    }
  } catch (e) {
    console.warn("completeJob: director-conversation update failed", e);
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

async function persistIdeas(
  cycleId: number | null,
  result: Record<string, unknown>,
) {
  const arr = result.ideas;
  if (!Array.isArray(arr) || arr.length === 0) return;
  const db = getDb();
  type IncomingIdea = { keyword: string; angle: string; brief: string; intent?: string };

  for (const raw of arr as IncomingIdea[]) {
    if (!raw || typeof raw.angle !== "string" || typeof raw.keyword !== "string") continue;
    // Try to link to an existing keyword row by exact text match (most-recent wins).
    let keywordId: number | null = null;
    try {
      const [match] = await db
        .select({ id: keywords.id })
        .from(keywords)
        .where(eq(keywords.keyword, raw.keyword))
        .orderBy(desc(keywords.id))
        .limit(1);
      keywordId = match?.id ?? null;
    } catch {
      keywordId = null;
    }
    await db.insert(ideas).values({
      cycleId: cycleId ?? null,
      keywordId,
      angle: raw.angle.slice(0, 500),
      brief: raw.brief ?? "",
      intent: raw.intent ? raw.intent.slice(0, 50) : null,
      status: "proposed",
    });
  }
}

async function persistArticle(
  cycleId: number | null,
  payload: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  const title = String(result.title ?? "").trim();
  const body = String(result.body ?? "").trim();
  if (!title || !body) return;
  const db = getDb();
  await db.insert(articles).values({
    cycleId: cycleId ?? null,
    ideaId: typeof payload.ideaId === "number" ? (payload.ideaId as number) : null,
    title,
    slug: String(result.slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")).slice(0, 200),
    body,
    metaTitle: result.metaTitle ? String(result.metaTitle).slice(0, 200) : null,
    metaDescription: result.metaDescription ? String(result.metaDescription).slice(0, 300) : null,
    status: "draft",
  });
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

  // Only write a failure run + notify if we're giving up (not retrying)
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
    try {
      await notifyJobFailure(row.agentKey, row.id, error);
    } catch (e) {
      console.warn("failJob: notifyJobFailure failed", e);
    }
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
