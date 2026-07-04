/**
 * PlanStep types + zod validation for the Director goal-plan steps stored in
 * plans.steps (JSONB). The steps array is FROZEN at approval — the plan driver
 * executes exactly these rows and never re-consults model output, so strict
 * validation at write time is the whole integrity story.
 */

import { z } from "zod";

export const PLAN_MAX_STEPS = 8;

/** Tools the Director may put in a plan (mirrors its dispatchable tools). */
export const PLAN_TOOLS = [
  "research",
  "idea_generation",
  "content_writing",
  "qa_validation",
  "seo_optimization",
  "outreach",
] as const;
export type PlanTool = (typeof PLAN_TOOLS)[number];

/** Tool → agent registry key (single source; the Director's map re-exports it). */
export const PLAN_TOOL_TO_AGENT: Record<PlanTool, string> = {
  research: "research",
  idea_generation: "idea-generation",
  content_writing: "content-writing",
  qa_validation: "qa",
  seo_optimization: "seo-optimization",
  outreach: "backlink",
};

export const PLAN_STEP_STATUSES = [
  "pending",
  "running",
  "awaiting-gate",
  "done",
  "failed",
  "skipped",
] as const;
export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

export const planStepSchema = z.object({
  n: z.number().int().positive(),
  tool: z.enum(PLAN_TOOLS),
  agentKey: z.string().min(1),
  title: z.string().min(1).max(200),
  how: z.string().max(500).default(""),
  args: z.record(z.string(), z.unknown()).default({}),
  // Derived SERVER-SIDE from CHECKPOINT_GATES — never trusted from the model.
  gated: z.boolean(),
  status: z.enum(PLAN_STEP_STATUSES).default("pending"),
  /** How many job results this step waits for (fan-out steps dispatch several). */
  expected: z.number().int().positive().optional(),
  jobIds: z.array(z.number().int()).optional(),
  runIds: z.array(z.number().int()).optional(),
  checkpointIds: z.array(z.number().int()).optional(),
});
export type PlanStep = z.infer<typeof planStepSchema>;

export const planStepsSchema = z.array(planStepSchema).min(1).max(PLAN_MAX_STEPS);

export const PLAN_STATUSES = [
  "draft",
  "active",
  "paused-gate",
  "completed",
  "failed",
  "cancelled",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Parse a plans.steps JSONB value; throws on tampered/invalid shape. */
export function parsePlanSteps(raw: unknown): PlanStep[] {
  return planStepsSchema.parse(raw);
}
