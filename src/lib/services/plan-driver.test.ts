import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { checkpoints, conversations, jobs, messages, plans, runs, sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSite } from "./sites";
import { createDraftPlan, activatePlan, getPlan } from "./plans";
import { dispatchStep } from "./plan-driver";
import { decideCheckpoint } from "./checkpoints";
import type { PlanStep } from "./plan-types";

// Keep the live-DB test hermetic: no real worker jobs run, no Telegram pings,
// no Gemini spend. enqueueJob/applyJobResult and the plans/checkpoints
// services stay REAL.
const { dispatched } = vi.hoisted(() => ({
  dispatched: [] as Array<{ agentKey: string; payload: Record<string, unknown> }>,
}));
vi.mock("./jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./jobs")>();
  return {
    ...actual,
    dispatchAgentJob: vi.fn(async (input: { agentKey: string; siteId: number; payload: Record<string, unknown> }) => {
      dispatched.push({ agentKey: input.agentKey, payload: input.payload });
      // Real queued row so a later applyJobResult can reference it (runs.job_id FK).
      const job = await actual.enqueueJob({
        agentKey: input.agentKey, siteId: input.siteId, payload: input.payload,
      });
      return { mode: "enqueued", job };
    }),
  };
});
vi.mock("./telegram", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./telegram")>();
  return {
    ...actual,
    sendMessage: vi.fn(async () => true),
    notifyJobSuccess: vi.fn(async () => {}),
    notifyJobFailure: vi.fn(async () => {}),
  };
});
vi.mock("./critic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./critic")>();
  return { ...actual, maybeCritique: vi.fn(async () => {}) };
});

const mkStep = (n: number, tool: PlanStep["tool"], agentKey: string, gated: boolean): PlanStep => ({
  n, tool, agentKey, title: `${tool} step`, how: "", args: {}, gated, status: "pending",
});

let siteId: number;
let convId: number;

describe("plan driver — advance, gate pause, approve-resume, complete", () => {
  beforeAll(async () => {
    const site = await createSite({
      key: `test-${Math.random().toString(36).slice(2, 8)}`,
      name: "Driver T", domain: "https://d.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    siteId = site.id;
    const [conv] = await getDb().insert(conversations)
      .values({ siteId, surface: "web" }).returning();
    convId = conv.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(messages).where(eq(messages.conversationId, convId));
    await db.delete(checkpoints).where(eq(checkpoints.siteId, siteId));
    await db.delete(plans).where(eq(plans.siteId, siteId));
    await db.delete(runs).where(eq(runs.siteId, siteId));
    await db.delete(jobs).where(eq(jobs.siteId, siteId));
    await db.delete(conversations).where(eq(conversations.id, convId));
    await db.delete(sites).where(eq(sites.id, siteId));
  });

  it("runs the whole lifecycle event-driven", { timeout: 60000 }, async () => {
    const { applyJobResult } = await import("./jobs");
    const draft = await createDraftPlan({
      siteId, conversationId: convId, goal: "test goal",
      steps: [
        mkStep(1, "research", "research", false),
        mkStep(2, "idea_generation", "idea-generation", true),
      ],
    });
    await activatePlan(draft.id);

    // Step 1 dispatch: marked running, one worker job enqueued with plan context.
    await dispatchStep(draft.id, 1);
    let plan = (await getPlan(draft.id))!;
    let steps = plan.steps as PlanStep[];
    expect(steps[0].status).toBe("running");
    expect(dispatched[0]?.agentKey).toBe("research");
    const step1JobId = steps[0].jobIds?.[0];
    expect(step1JobId).toBeTypeOf("number");

    // Step 1 completes (simulated worker) → step 1 done, step 2 auto-dispatched.
    await applyJobResult({
      agentKey: "research", siteId, cycleId: null,
      payload: dispatched[0].payload, result: { keywords: [] },
      jobId: step1JobId, notifyJobId: step1JobId,
    });
    plan = (await getPlan(draft.id))!;
    steps = plan.steps as PlanStep[];
    expect(steps[0].status).toBe("done");
    expect(steps[1].status).toBe("running");
    expect(plan.currentStep).toBe(2);
    expect(plan.status).toBe("active");
    expect(dispatched[1]?.agentKey).toBe("idea-generation");

    // Step 2 (gated) completes → checkpoint created → plan pauses at the gate.
    const step2JobId = (steps[1].jobIds ?? [])[0];
    await applyJobResult({
      agentKey: "idea-generation", siteId, cycleId: null,
      payload: dispatched[1].payload, result: { ideas: [] },
      jobId: step2JobId, notifyJobId: step2JobId,
    });
    plan = (await getPlan(draft.id))!;
    steps = plan.steps as PlanStep[];
    expect(plan.status).toBe("paused-gate");
    expect(steps[1].status).toBe("awaiting-gate");
    const cpId = steps[1].checkpointIds?.[0];
    expect(cpId).toBeTypeOf("number");

    // Approving the checkpoint resumes → last step done → plan completed.
    await decideCheckpoint(cpId!, "approve", { actor: "test" });
    plan = (await getPlan(draft.id))!;
    steps = plan.steps as PlanStep[];
    expect(steps[1].status).toBe("done");
    expect(plan.status).toBe("completed");

    // The chat got comeback messages (plan-update assistant messages).
    const db = getDb();
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, convId));
    const planUpdates = msgs.filter(
      (m) => (m.payload as Record<string, unknown> | null)?.kind === "plan-update",
    );
    expect(planUpdates.length).toBeGreaterThanOrEqual(2); // gate pause + completion
  });

  it("reject at the gate cancels the plan", { timeout: 60000 }, async () => {
    const { applyJobResult } = await import("./jobs");
    const draft = await createDraftPlan({
      siteId, conversationId: convId, goal: "reject goal",
      steps: [mkStep(1, "idea_generation", "idea-generation", true)],
    });
    await activatePlan(draft.id);
    await dispatchStep(draft.id, 1);
    let plan = (await getPlan(draft.id))!;
    const jobId = (plan.steps as PlanStep[])[0].jobIds?.[0];
    await applyJobResult({
      agentKey: "idea-generation", siteId, cycleId: null,
      payload: dispatched[dispatched.length - 1].payload, result: { ideas: [] },
      jobId, notifyJobId: jobId,
    });
    plan = (await getPlan(draft.id))!;
    const cpId = (plan.steps as PlanStep[])[0].checkpointIds?.[0];
    await decideCheckpoint(cpId!, "reject", { actor: "test" });
    plan = (await getPlan(draft.id))!;
    expect(plan.status).toBe("cancelled");
    expect((plan.steps as PlanStep[])[0].status).toBe("failed");
  });
});
