import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db/client";
import { conversations, plans, sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSite } from "./sites";
import {
  activatePlan, createDraftPlan, getActivePlanForSite,
  getLatestPlanForConversation, setPlanStatus, updateStep, PlanError,
} from "./plans";
import type { PlanStep } from "./plan-types";

const mkStep = (n: number, over: Partial<PlanStep> = {}): PlanStep => ({
  n, tool: "research", agentKey: "research",
  title: `step ${n}`, how: "", args: {}, gated: false, status: "pending",
  ...over,
});

let siteId: number;
let convId: number;

describe("plans service", () => {
  beforeAll(async () => {
    const site = await createSite({
      key: `test-${Math.random().toString(36).slice(2, 8)}`,
      name: "Plans T", domain: "https://p.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    siteId = site.id;
    const [conv] = await getDb().insert(conversations)
      .values({ siteId, surface: "web" }).returning();
    convId = conv.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(plans).where(eq(plans.siteId, siteId));
    await db.delete(conversations).where(eq(conversations.id, convId));
    await db.delete(sites).where(eq(sites.id, siteId));
  });

  it("draft → activate → step update → status walk; supersedes older drafts; one in-flight per site", { timeout: 30000 }, async () => {
    const draft1 = await createDraftPlan({
      siteId, conversationId: convId, goal: "goal A", steps: [mkStep(1), mkStep(2, { gated: true })],
    });
    expect(draft1.status).toBe("draft");

    // A second draft for the same conversation supersedes the first.
    const draft2 = await createDraftPlan({
      siteId, conversationId: convId, goal: "goal B", steps: [mkStep(1)],
    });
    expect((await getLatestPlanForConversation(convId, "draft"))?.id).toBe(draft2.id);
    const db = getDb();
    const [old] = await db.select().from(plans).where(eq(plans.id, draft1.id)).limit(1);
    expect(old.status).toBe("cancelled");

    // Activate; site now has an in-flight plan.
    const active = await activatePlan(draft2.id);
    expect(active.status).toBe("active");
    expect(active.approvedAt).not.toBeNull();
    expect((await getActivePlanForSite(siteId))?.id).toBe(draft2.id);

    // A new draft can exist, but can't activate while one is in flight.
    const draft3 = await createDraftPlan({
      siteId, conversationId: convId, goal: "goal C", steps: [mkStep(1)],
    });
    await expect(activatePlan(draft3.id)).rejects.toBeInstanceOf(PlanError);

    // Step update round-trips through zod.
    const patched = await updateStep(draft2.id, 1, { status: "running", jobIds: [7] });
    const steps = patched.steps as PlanStep[];
    expect(steps[0].status).toBe("running");
    expect(steps[0].jobIds).toEqual([7]);

    // Finish it; site has no in-flight plan again.
    await setPlanStatus(draft2.id, "completed", 1);
    expect(await getActivePlanForSite(siteId)).toBeNull();
  });

  it("rejects invalid steps at write time", async () => {
    await expect(createDraftPlan({
      siteId, conversationId: convId, goal: "bad",
      steps: [{ ...mkStep(1), tool: "rm -rf" as never }],
    })).rejects.toThrow();
  });
});
