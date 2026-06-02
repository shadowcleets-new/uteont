import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, runs, keywords, ideas, articles } from "@/lib/db/schema";
import { notifyJobSuccess, notifyJobFailure } from "./notify-job";
import {
  isDedupeEligible,
  isCacheableResult,
  computeDedupeKey,
  lookupResult,
  storeResult,
  bumpHitCount,
} from "./result-cache";
import { logEvent } from "@/lib/observability/logger";

export interface EnqueueJobInput {
  agentKey: string;
  siteId: number;       // required — must match a sites.id row
  payload: Record<string, unknown>;
  cycleId?: number;
  priority?: number;
  maxAttempts?: number;
}

export async function enqueueJob(input: EnqueueJobInput) {
  if (!input.siteId) {
    throw new Error("enqueueJob: siteId is required");
  }
  const db = getDb();
  const [row] = await db
    .insert(jobs)
    .values({
      agentKey: input.agentKey,
      siteId: input.siteId,
      payload: input.payload,
      cycleId: input.cycleId,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      status: "queued",
    })
    .returning();
  return row;
}

export type DispatchResult =
  | { mode: "enqueued"; job: typeof jobs.$inferSelect }
  | { mode: "cached"; runId: number; result: Record<string, unknown>; sourceJobId: number | null };

/**
 * Dedup-aware enqueue. If the agent is dedupe-eligible and this request hashes
 * to a live cached result (and forceFresh isn't set), replay that result via
 * applyJobResult instead of enqueuing a worker job. Any failure falls through
 * to a normal enqueue (fail-safe — dedup can never block real work).
 */
export async function dispatchAgentJob(
  input: EnqueueJobInput & { forceFresh?: boolean },
): Promise<DispatchResult> {
  const payload: Record<string, unknown> = { ...input.payload };

  if (isDedupeEligible(input.agentKey) && !input.forceFresh) {
    const dedupeKey = computeDedupeKey(input.agentKey, input.siteId, payload);
    let hit: Awaited<ReturnType<typeof lookupResult>> = null;
    try {
      hit = await lookupResult(dedupeKey);
    } catch (e) {
      console.warn("dispatchAgentJob: lookupResult failed; enqueuing fresh", e);
      hit = null;
    }
    if (hit) {
      try {
        const { runId } = await applyJobResult({
          agentKey: input.agentKey,
          siteId: input.siteId,
          cycleId: input.cycleId ?? null,
          payload,
          result: hit.result,
          jobId: null,
          notifyJobId: hit.sourceJobId ?? 0,
          startedAt: new Date(),
          suppressDirectorMessage: true,
        });
        try {
          await bumpHitCount(hit.id);
        } catch (e) {
          console.warn("dispatchAgentJob: bumpHitCount failed", e);
        }
        logEvent({
          kind: "dedup.hit",
          agentKey: input.agentKey,
          siteId: input.siteId,
          sourceJobId: hit.sourceJobId ?? undefined,
        });
        return { mode: "cached", runId, result: hit.result, sourceJobId: hit.sourceJobId ?? null };
      } catch (e) {
        // Replay failed — fall through to a normal enqueue.
        console.warn("dispatchAgentJob: cache replay failed; enqueuing fresh", e);
      }
    } else {
      logEvent({ kind: "dedup.miss", agentKey: input.agentKey, siteId: input.siteId });
    }
    // Miss (or replay failure): stamp the key so completeJob stores the fresh result.
    payload._dedupeKey = dedupeKey;
  }

  const job = await enqueueJob({
    agentKey: input.agentKey,
    siteId: input.siteId,
    payload,
    cycleId: input.cycleId,
    priority: input.priority,
    maxAttempts: input.maxAttempts,
  });
  return { mode: "enqueued", job };
}

/**
 * Apply all side-effects of a finished agent result: write the runs row,
 * persist agent-specific output, send the Telegram notification, and (unless
 * suppressed) post the Director conversation system message.
 *
 * Extracted from completeJob so a cached replay can reproduce the exact same
 * effects without a real job. On the real worker path completeJob calls this
 * with the job's real ids, so behavior is unchanged.
 */
export interface ApplyJobResultInput {
  agentKey: string;
  siteId: number;
  cycleId: number | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  jobId?: number | null; // runs.job_id — null on replay
  notifyJobId?: number; // Telegram message/button id — replay passes sourceJobId ?? 0
  startedAt?: Date;
  suppressDirectorMessage?: boolean; // replay-from-Director sets true (Director re-posts)
}

// Gated agent outputs that should land in the human approval inbox (/approvals).
// gate codes match the checkpoint state machine (A=idea selection, B=draft
// review, C=outreach send).
const CHECKPOINT_GATES: Record<string, { gate: string; blastRadius: number }> = {
  "idea-generation": { gate: "A", blastRadius: 0 },
  "content-writing": { gate: "B", blastRadius: 1 },
  backlink: { gate: "C", blastRadius: 1 },
};

function checkpointTitle(agentKey: string, payload: Record<string, unknown>, result: Record<string, unknown>): string {
  if (agentKey === "content-writing") {
    const title = String((result.title as string) ?? (payload.title as string) ?? "draft article");
    return `Review draft: ${title.slice(0, 80)}`;
  }
  if (agentKey === "idea-generation") {
    const n = Array.isArray(result.ideas) ? (result.ideas as unknown[]).length : undefined;
    return n ? `Review ${n} generated idea${n === 1 ? "" : "s"}` : "Review generated content ideas";
  }
  if (agentKey === "backlink") return "Approve outreach email";
  return `Review ${agentKey} output`;
}

function checkpointSummary(agentKey: string): string {
  if (agentKey === "content-writing") return "A draft article is ready for review before publishing.";
  if (agentKey === "idea-generation") return "Generated ideas are waiting for selection.";
  if (agentKey === "backlink") return "An outreach email draft is ready — review before sending.";
  return "Output awaiting review.";
}

export async function applyJobResult(input: ApplyJobResultInput): Promise<{ runId: number }> {
  const db = getDb();

  // 1. Write a runs row (telemetry)
  const [run] = await db
    .insert(runs)
    .values({
      subjectKey: `agent.${input.agentKey}`,
      category: "agent",
      action: `worker:${input.agentKey}`,
      siteId: input.siteId,
      cycleId: input.cycleId,
      jobId: input.jobId ?? null,
      startedAt: input.startedAt ?? new Date(),
      finishedAt: new Date(),
      status: "success",
      result: input.result,
    })
    .returning();

  // 2. Agent-specific persistence (each wrapped — a typed-table issue must not
  //    roll back the runs row).
  try {
    if (input.agentKey === "research") {
      await persistResearchKeywords(input.siteId, input.cycleId, run.id, input.result);
    } else if (input.agentKey === "idea-generation") {
      await persistIdeas(input.cycleId, input.result);
    } else if (input.agentKey === "content-writing") {
      await persistArticle(input.siteId, input.cycleId, input.payload, input.result);
    }
    // outreach/backlink: result captured in runs.result; no typed table v1.
  } catch (e) {
    console.warn(`applyJobResult: agent-persist failed for ${input.agentKey}`, e);
  }

  // 2.5 Enqueue an approval checkpoint for gated outputs so finished work that
  //     needs sign-off reaches the /approvals inbox. Real jobs only — a cached
  //     replay (jobId null) would re-enqueue an already-decided item.
  if (input.jobId != null) {
    const gateCfg = CHECKPOINT_GATES[input.agentKey];
    if (gateCfg) {
      try {
        const { createCheckpoint } = await import("./checkpoints");
        await createCheckpoint({
          siteId: input.siteId,
          gate: gateCfg.gate,
          title: checkpointTitle(input.agentKey, input.payload, input.result),
          summary: checkpointSummary(input.agentKey),
          payload: { agentKey: input.agentKey, jobId: input.jobId, runId: run.id, result: input.result },
          blastRadius: gateCfg.blastRadius,
        });
      } catch (e) {
        console.warn("applyJobResult: createCheckpoint failed", e);
      }
    }
  }

  // 3. Telegram notification (best-effort, never throws into caller)
  try {
    await notifyJobSuccess(input.agentKey, input.notifyJobId ?? 0, input.result);
  } catch (e) {
    console.warn("applyJobResult: notifyJobSuccess failed", e);
  }

  // 4. Director conversation system message (unless the caller will post it).
  if (!input.suppressDirectorMessage) {
    try {
      const ctx = (input.payload as Record<string, unknown> | null)?.["_directorContext"] as
        | { conversationId?: number }
        | undefined;
      if (ctx?.conversationId) {
        const { appendMessage } = await import("./conversations");
        await appendMessage({
          conversationId: ctx.conversationId,
          role: "system",
          content: `${input.agentKey} job ${input.notifyJobId ?? input.jobId ?? 0} completed`,
          payload: {
            kind: "job-completed",
            agentKey: input.agentKey,
            jobId: input.jobId ?? null,
            result: input.result,
          },
        });
      }
    } catch (e) {
      console.warn("applyJobResult: director-conversation update failed", e);
    }
  }

  return { runId: run.id };
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
 * Complete a job: mark it done, apply all result side-effects (runs row,
 * persistence, notification, Director message), then best-effort store the
 * result for dedup if eligible.
 */
export async function completeJob(jobId: number, result: Record<string, unknown>) {
  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return;

  // 1. Mark job done
  await db
    .update(jobs)
    .set({ status: "done", finishedAt: new Date(), result })
    .where(eq(jobs.id, jobId));

  // 2. Apply all result side-effects (identical to the pre-refactor behavior)
  const startedAt = (job.claimedAt as Date | null) ?? (job.createdAt as Date);
  const { runId } = await applyJobResult({
    agentKey: job.agentKey,
    siteId: job.siteId,
    cycleId: job.cycleId,
    payload: (job.payload ?? {}) as Record<string, unknown>,
    result,
    jobId: job.id,
    notifyJobId: job.id,
    startedAt,
    suppressDirectorMessage: false,
  });

  // 3. Store to the dedup cache (best-effort — never breaks the job). The key
  //    was stamped onto the payload at dispatch time; never recompute here.
  try {
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const dedupeKey = payload["_dedupeKey"];
    if (
      typeof dedupeKey === "string" &&
      isDedupeEligible(job.agentKey) &&
      isCacheableResult(job.agentKey, result)
    ) {
      await storeResult({
        dedupeKey,
        agentKey: job.agentKey,
        siteId: job.siteId,
        result,
        sourceRunId: runId,
        sourceJobId: job.id,
      });
    }
  } catch (e) {
    console.warn("completeJob: storeResult failed", e);
  }
}

async function persistResearchKeywords(
  siteId: number,
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
      siteId,
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
  siteId: number,
  cycleId: number | null,
  payload: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  const title = String(result.title ?? "").trim();
  const body = String(result.body ?? "").trim();
  if (!title || !body) return;
  const db = getDb();
  await db.insert(articles).values({
    siteId,
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
      siteId: row.siteId,
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
