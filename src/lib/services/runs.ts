import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";

export interface StartRunInput {
  subjectKey: string;
  category: "agent" | "infra";
  action: string;
  siteId: number;       // required — runs.siteId is NOT NULL
  cycleId?: number;
  jobId?: number;
}

export async function startRun(input: StartRunInput) {
  if (!input.siteId) {
    throw new Error("startRun: siteId is required");
  }
  const db = getDb();
  const [row] = await db
    .insert(runs)
    .values({
      subjectKey: input.subjectKey,
      category: input.category,
      action: input.action,
      siteId: input.siteId,
      cycleId: input.cycleId,
      jobId: input.jobId,
      status: "running",
    })
    .returning();
  return row;
}

export interface FinishRunInput {
  runId: number;
  status: "success" | "failure";
  result?: Record<string, unknown>;
  error?: string;
}

export async function finishRun(input: FinishRunInput) {
  const db = getDb();
  await db
    .update(runs)
    .set({
      status: input.status,
      finishedAt: new Date(),
      result: input.result ?? null,
      error: input.error ?? null,
    })
    .where(eq(runs.id, input.runId));
}

export async function listRuns(
  subjectKey?: string,
  limit = 50,
  opts: { siteId?: number } = {},
) {
  const db = getDb();
  const conditions = [];
  if (subjectKey) conditions.push(eq(runs.subjectKey, subjectKey));
  if (opts.siteId) conditions.push(eq(runs.siteId, opts.siteId));
  return db
    .select()
    .from(runs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(runs.id))
    .limit(limit);
}

export async function getRun(id: number) {
  const db = getDb();
  const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  return row ?? null;
}
