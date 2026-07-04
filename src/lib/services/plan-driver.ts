/**
 * Plan driver — executes an approved Director goal plan autonomously between
 * approval gates (Phase 2). Event-driven: job completion (applyJobResult),
 * terminal failure (failJob), and checkpoint decisions (decideCheckpoint) call
 * the hooks here; there is no scheduler.
 *
 * Every hook is designed to be wrapped in try/catch by its caller: a plan
 * driver bug must never break job completion or a checkpoint decision.
 * Execution reads ONLY the frozen plans.steps rows — never model output.
 */

import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { articles, ideas, keywords, type Checkpoint } from "@/lib/db/schema";
import { getPlan, setPlanStatus, updateStep } from "./plans";
import { parsePlanSteps, PLAN_TOOL_TO_AGENT, type PlanStep } from "./plan-types";
import { appendMessage } from "./conversations";
import { getSiteById } from "./sites";

export interface PlanContext {
  planId: number;
  stepN: number;
}

/** Extract the plan context a dispatched job carries, if any. */
export function planContextFromPayload(
  payload: Record<string, unknown> | null | undefined,
): PlanContext | null {
  const raw = payload?.["_planContext"] as { planId?: unknown; stepN?: unknown } | undefined;
  if (raw && typeof raw.planId === "number" && typeof raw.stepN === "number") {
    return { planId: raw.planId, stepN: raw.stepN };
  }
  return null;
}

// --- chat comebacks ---------------------------------------------------------

/** Post a Director-voiced progress message into the plan's conversation, and
 *  mirror it to Telegram (Phase 3) so the owner can supervise from their phone.
 *  Both sinks are best-effort — a notification failure never blocks the plan. */
async function postPlanMessage(
  plan: { id: number; conversationId: number; goal?: string },
  content: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await appendMessage({
      conversationId: plan.conversationId,
      role: "assistant",
      content,
      payload: { kind: "plan-update", planId: plan.id, ...extra },
    });
  } catch (e) {
    console.warn("plan-driver: postPlanMessage failed", e);
  }
  try {
    const { sendMessage } = await import("./telegram");
    const goal = plan.goal ? ` — ${plan.goal.slice(0, 60)}` : "";
    await sendMessage({ text: `📋 Plan #${plan.id}${goal}\n${content}` });
  } catch (e) {
    console.warn("plan-driver: telegram mirror failed", e);
  }
}

const stepLabel = (s: PlanStep, total: number) => `step ${s.n} of ${total} — ${s.title}`;

// --- arg resolution ---------------------------------------------------------

/** Latest approved keywords for the site (idea_generation fallback input);
 *  prefers approved rows, falls back to any recent keywords. */
async function approvedKeywords(siteId: number, cap = 10): Promise<string[]> {
  const db = getDb();
  const all = await db
    .select({ keyword: keywords.keyword, status: keywords.status })
    .from(keywords)
    .where(eq(keywords.siteId, siteId))
    .orderBy(desc(keywords.id))
    .limit(200);
  const approved = all.filter((k) => k.status === "approved").map((k) => k.keyword);
  return (approved.length ? approved : all.map((k) => k.keyword)).slice(0, cap);
}

/** Ideas produced by the plan's idea step (or recent drafts-awaiting ideas). */
async function ideasToDraft(siteId: number, ideaRunIds: number[], cap = 5) {
  const db = getDb();
  if (ideaRunIds.length > 0) {
    return await db
      .select()
      .from(ideas)
      .where(inArray(ideas.runId, ideaRunIds))
      .then((rows) => rows.filter((i) => i.status !== "rejected").slice(0, cap));
  }
  return await db
    .select()
    .from(ideas)
    .where(eq(ideas.siteId, siteId))
    .orderBy(desc(ideas.id))
    .then((rows) => rows.filter((i) => !["rejected", "done"].includes(i.status)).slice(0, cap));
}

// --- dispatch ----------------------------------------------------------------

/**
 * Dispatch one plan step. Marks the step running (with its expected result
 * count) BEFORE dispatching, because a dedup cache hit completes synchronously
 * inside dispatchAgentJob and re-enters onJobResult during this call.
 */
export async function dispatchStep(planId: number, n: number): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan || !["active"].includes(plan.status)) return;
  const steps = parsePlanSteps(plan.steps);
  const step = steps.find((s) => s.n === n);
  if (!step || step.status !== "pending") return;
  const total = steps.length;

  const site = await getSiteById(plan.siteId);
  if (!site) {
    await setPlanStatus(planId, "failed");
    await postPlanMessage(plan, `Plan stopped: site ${plan.siteId} no longer exists.`);
    return;
  }
  const siteSnapshot = {
    id: site.id, key: site.key, name: site.name, domain: site.domain,
    locale: site.locale, niche: site.niche, audience: site.audience,
    voiceGuide: site.voiceGuide, contentPillars: site.contentPillars,
    bannedPhrases: site.bannedPhrases,
  };
  const basePayload = (args: Record<string, unknown>) => ({
    ...args,
    goal: plan.goal,
    site: siteSnapshot,
    _planContext: { planId, stepN: n },
  });

  // fn-runtime steps (qa / seo-optimization) run inline, one pass per article
  // from the plan's content step; they are ungated and advance synchronously.
  if (step.tool === "qa_validation" || step.tool === "seo_optimization") {
    const contentRunIds = steps
      .filter((s) => s.tool === "content_writing" && s.n < n)
      .flatMap((s) => s.runIds ?? []);
    const db = getDb();
    const targets = contentRunIds.length
      ? await db.select().from(articles).where(inArray(articles.runId, contentRunIds))
      : [];
    await updateStep(planId, n, { status: "running", expected: Math.max(1, targets.length) });
    const runIds: number[] = [];
    try {
      const { runAgent } = await import("./agents");
      for (const a of targets) {
        const res = await runAgent({
          agentKey: PLAN_TOOL_TO_AGENT[step.tool],
          siteId: plan.siteId,
          payload: { article: a.body, targetKeyword: step.args["targetKeyword"] ?? undefined },
        });
        if (res.runId) runIds.push(res.runId);
      }
      await updateStep(planId, n, {
        status: targets.length ? "done" : "skipped",
        runIds,
      });
      await advancePlan(planId, n);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateStep(planId, n, { status: "failed" });
      await setPlanStatus(planId, "failed");
      await postPlanMessage(plan, `Plan paused: ${stepLabel(step, total)} failed inline (${msg.slice(0, 200)}).`);
    }
    return;
  }

  // worker-runtime steps — resolve dynamic inputs, then enqueue.
  let dispatches: Array<Record<string, unknown>> = [];
  if (step.tool === "idea_generation") {
    const kw = Array.isArray(step.args["keywords"]) && (step.args["keywords"] as unknown[]).length
      ? (step.args["keywords"] as string[])
      : await approvedKeywords(plan.siteId);
    dispatches = [{ ...step.args, keywords: kw }];
  } else if (step.tool === "content_writing") {
    const ideaRunIds = steps
      .filter((s) => s.tool === "idea_generation" && s.n < n)
      .flatMap((s) => s.runIds ?? []);
    const rows = await ideasToDraft(plan.siteId, ideaRunIds); // ponytail: cap 5 drafts/step
    if (rows.length === 0) {
      await updateStep(planId, n, { status: "skipped" });
      await postPlanMessage(plan, `Skipped ${stepLabel(step, total)} — no ideas available to draft.`);
      await advancePlan(planId, n);
      return;
    }
    const db = getDb();
    dispatches = await Promise.all(rows.map(async (i) => {
      let targetKeyword = "";
      if (i.keywordId) {
        const [k] = await db.select({ keyword: keywords.keyword }).from(keywords)
          .where(eq(keywords.id, i.keywordId)).limit(1);
        targetKeyword = k?.keyword ?? "";
      }
      return {
        ...step.args,
        title: i.angle,
        brief: i.brief,
        targetKeyword: targetKeyword || i.angle,
        ideaId: i.id,
      };
    }));
  } else {
    dispatches = [{ ...step.args }];
  }

  await updateStep(planId, n, { status: "running", expected: dispatches.length });
  const { dispatchAgentJob } = await import("./jobs");
  for (const args of dispatches) {
    const dispatch = await dispatchAgentJob({
      agentKey: step.agentKey,
      siteId: plan.siteId,
      payload: basePayload(args),
    });
    if (dispatch.mode === "enqueued") {
      const cur = await getPlan(planId);
      const curStep = cur ? parsePlanSteps(cur.steps).find((s) => s.n === n) : undefined;
      await updateStep(planId, n, { jobIds: [...(curStep?.jobIds ?? []), dispatch.job.id] });
    }
    // cached mode: applyJobResult already ran synchronously and onJobResult
    // recorded the runId (and possibly advanced the plan) — nothing to do here.
  }
}

// --- advancement -------------------------------------------------------------

/** Mark step n finished territory and move on (dispatch n+1 or complete). */
async function advancePlan(planId: number, n: number): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) return;
  const steps = parsePlanSteps(plan.steps);
  const total = steps.length;
  const next = steps.find((s) => s.n === n + 1);
  if (!next) {
    await setPlanStatus(planId, "completed", n);
    await postPlanMessage(plan, `Plan complete — all ${total} steps done. Goal: "${plan.goal}".`);
    return;
  }
  await setPlanStatus(planId, "active", next.n);
  await postPlanMessage(
    plan,
    `Step ${n} of ${total} done — starting ${stepLabel(next, total)}.`,
    { stepN: next.n },
  );
  await dispatchStep(planId, next.n);
}

/**
 * Called from applyJobResult when a completed job carries _planContext.
 * Records the result; when all expected results are in: gated steps pause the
 * plan on their checkpoints, ungated steps advance.
 */
export async function onJobResult(
  ctx: PlanContext,
  input: { jobId: number | null; runId: number; checkpointId: number | null },
): Promise<void> {
  const plan = await getPlan(ctx.planId);
  if (!plan || !["active", "paused-gate"].includes(plan.status)) return;
  const steps = parsePlanSteps(plan.steps);
  const step = steps.find((s) => s.n === ctx.stepN);
  if (!step || !["running", "awaiting-gate"].includes(step.status)) return;
  const total = steps.length;

  const runIds = [...(step.runIds ?? []), input.runId];
  const checkpointIds = input.checkpointId
    ? [...(step.checkpointIds ?? []), input.checkpointId]
    : step.checkpointIds;
  const complete = runIds.length >= (step.expected ?? 1);

  if (step.gated) {
    await updateStep(ctx.planId, ctx.stepN, {
      status: complete ? "awaiting-gate" : step.status,
      runIds,
      checkpointIds,
    });
    if (complete) {
      await setPlanStatus(ctx.planId, "paused-gate");
      const nCps = checkpointIds?.length ?? 0;
      await postPlanMessage(
        plan,
        `${stepLabel(step, total)} finished and is waiting for your review — ` +
          `${nCps > 1 ? `${nCps} items are` : "it is"} in the Approvals inbox. ` +
          `I'll continue the plan automatically when you approve.`,
        { stepN: step.n, awaitingGate: true },
      );
    }
    return;
  }

  await updateStep(ctx.planId, ctx.stepN, {
    status: complete ? "done" : "running",
    runIds,
  });
  if (complete) await advancePlan(ctx.planId, ctx.stepN);
}

/**
 * Called from decideCheckpoint when the checkpoint carries plan context.
 * approve/edit → resume once every checkpoint of the step is decided;
 * reject → cancel the plan.
 */
export async function onCheckpointDecision(cp: Checkpoint, verb: string): Promise<void> {
  const payload = cp.payload as Record<string, unknown> | null;
  const planId = typeof payload?.planId === "number" ? payload.planId : null;
  const stepN = typeof payload?.stepN === "number" ? payload.stepN : null;
  if (planId == null || stepN == null) return;
  const plan = await getPlan(planId);
  if (!plan || plan.status !== "paused-gate") return;
  const steps = parsePlanSteps(plan.steps);
  const step = steps.find((s) => s.n === stepN);
  if (!step || step.status !== "awaiting-gate") return;
  const total = steps.length;

  if (verb === "reject") {
    await updateStep(planId, stepN, { status: "failed" });
    await setPlanStatus(planId, "cancelled");
    await postPlanMessage(
      plan,
      `Plan stopped — you rejected the review at ${stepLabel(step, total)}. ` +
        `Tell me how to adjust and I'll draft a new plan.`,
    );
    return;
  }

  // approve / edit — resume only when NO checkpoint of this step is still pending.
  const cpIds = (step.checkpointIds ?? []).filter((id) => id !== cp.id);
  if (cpIds.length > 0) {
    const db = getDb();
    const { checkpoints } = await import("@/lib/db/schema");
    const others = await db
      .select({ status: checkpoints.status })
      .from(checkpoints)
      .where(inArray(checkpoints.id, cpIds));
    if (others.some((r) => r.status === "pending")) return; // wait for the rest of the batch
  }

  await updateStep(planId, stepN, { status: "done" });
  await setPlanStatus(planId, "active");
  await advancePlan(planId, stepN);
}

/** Called from failJob's terminal branch when the dead job carried plan context. */
export async function onJobFailedTerminal(ctx: PlanContext, error: string): Promise<void> {
  const plan = await getPlan(ctx.planId);
  if (!plan || !["active", "paused-gate"].includes(plan.status)) return;
  const steps = parsePlanSteps(plan.steps);
  const step = steps.find((s) => s.n === ctx.stepN);
  if (!step) return;
  await updateStep(ctx.planId, ctx.stepN, { status: "failed" });
  await setPlanStatus(ctx.planId, "failed");
  await postPlanMessage(
    plan,
    `Plan paused — ${stepLabel(step, steps.length)} failed after retries: ` +
      `${error.slice(0, 200)}. Say "retry the plan" and I'll re-run that step.`,
  );
}

/** Re-run the failed step of a failed plan (the chat "retry the plan" path). */
export async function retryFailedPlan(planId: number): Promise<boolean> {
  const plan = await getPlan(planId);
  if (!plan || plan.status !== "failed") return false;
  const steps = parsePlanSteps(plan.steps);
  const failed = steps.find((s) => s.status === "failed");
  if (!failed) return false;
  await updateStep(planId, failed.n, {
    status: "pending", expected: undefined, jobIds: [], runIds: [], checkpointIds: [],
  });
  await setPlanStatus(planId, "active", failed.n);
  await postPlanMessage(plan, `Retrying step ${failed.n} of ${steps.length} — ${failed.title}.`);
  await dispatchStep(planId, failed.n);
  return true;
}
