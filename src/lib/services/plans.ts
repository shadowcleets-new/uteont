/**
 * Plans persistence — the Director's frozen goal plans (Phase 2).
 *
 * All step mutation goes through updateStep/setPlanStatus here and the plan
 * driver; nothing else writes plans.steps. Updates are strictly sequential
 * (single-operator app, one completion funnel), so JSONB read-modify-write is
 * safe without row locks.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { plans, type Plan } from "@/lib/db/schema";
import {
  parsePlanSteps,
  planStepsSchema,
  type PlanStep,
  type PlanStatus,
} from "./plan-types";

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

export interface CreateDraftPlanInput {
  siteId: number;
  conversationId: number;
  goal: string;
  steps: PlanStep[];
}

/**
 * Persist a proposed plan as a draft. Any older draft for the same conversation
 * is superseded (cancelled) so "the draft plan" for a conversation is unique.
 */
export async function createDraftPlan(input: CreateDraftPlanInput): Promise<Plan> {
  const steps = planStepsSchema.parse(input.steps);
  const db = getDb();
  await db
    .update(plans)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(plans.conversationId, input.conversationId), eq(plans.status, "draft")));
  const [row] = await db
    .insert(plans)
    .values({
      siteId: input.siteId,
      conversationId: input.conversationId,
      goal: input.goal.slice(0, 500),
      status: "draft",
      currentStep: 0,
      steps,
    })
    .returning();
  return row;
}

export async function getPlan(id: number): Promise<Plan | null> {
  const db = getDb();
  const [row] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return row ?? null;
}

/** The site's single in-flight plan (active or paused at a gate), if any. */
export async function getActivePlanForSite(siteId: number): Promise<Plan | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.siteId, siteId), inArray(plans.status, ["active", "paused-gate"])))
    .orderBy(desc(plans.id))
    .limit(1);
  return row ?? null;
}

export async function getLatestPlanForConversation(
  conversationId: number,
  status?: PlanStatus,
): Promise<Plan | null> {
  const db = getDb();
  const where = status
    ? and(eq(plans.conversationId, conversationId), eq(plans.status, status))
    : eq(plans.conversationId, conversationId);
  const [row] = await db.select().from(plans).where(where).orderBy(desc(plans.id)).limit(1);
  return row ?? null;
}

export async function listPlansForSite(siteId: number, limit = 10): Promise<Plan[]> {
  const db = getDb();
  return await db
    .select()
    .from(plans)
    .where(eq(plans.siteId, siteId))
    .orderBy(desc(plans.id))
    .limit(limit);
}

/**
 * draft → active. Guards: still a draft, and the site has no other in-flight
 * plan (one active plan per site — keeps the driver's sequencing trivial).
 */
export async function activatePlan(id: number): Promise<Plan> {
  const plan = await getPlan(id);
  if (!plan) throw new PlanError(`Plan ${id} not found`);
  if (plan.status !== "draft") throw new PlanError(`Plan ${id} is ${plan.status}, not draft`);
  const inFlight = await getActivePlanForSite(plan.siteId);
  if (inFlight) {
    throw new PlanError(
      `Site already has plan #${inFlight.id} in flight (${inFlight.status}) — finish or cancel it first`,
    );
  }
  const db = getDb();
  const [row] = await db
    .update(plans)
    .set({ status: "active", approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(plans.id, id), eq(plans.status, "draft")))
    .returning();
  if (!row) throw new PlanError(`Plan ${id} changed under us`);
  return row;
}

export async function setPlanStatus(
  id: number,
  status: PlanStatus,
  currentStep?: number,
): Promise<Plan> {
  const db = getDb();
  const [row] = await db
    .update(plans)
    .set({
      status,
      ...(currentStep !== undefined ? { currentStep } : {}),
      updatedAt: new Date(),
    })
    .where(eq(plans.id, id))
    .returning();
  if (!row) throw new PlanError(`Plan ${id} not found`);
  return row;
}

/** Read-modify-write one step of the JSONB array. Returns the updated plan. */
export async function updateStep(
  planId: number,
  n: number,
  patch: Partial<PlanStep>,
): Promise<Plan> {
  const plan = await getPlan(planId);
  if (!plan) throw new PlanError(`Plan ${planId} not found`);
  const steps = parsePlanSteps(plan.steps);
  const idx = steps.findIndex((s) => s.n === n);
  if (idx === -1) throw new PlanError(`Plan ${planId} has no step ${n}`);
  steps[idx] = planStepsSchema.element.parse({ ...steps[idx], ...patch, n });
  const db = getDb();
  const [row] = await db
    .update(plans)
    .set({ steps, updatedAt: new Date() })
    .where(eq(plans.id, planId))
    .returning();
  return row;
}
