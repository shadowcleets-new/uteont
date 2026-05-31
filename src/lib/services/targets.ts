/**
 * #2 Target Control Panel service.
 *
 * CRUD for objectives plus live measurement: `metric` selects how the current
 * value is read (a computed pipeline count, or the manual override), and the
 * pure trajectory engine turns (baseline -> current -> goal over a window) into
 * the progress vector shown in the control panel.
 */

import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { targets, articles, keywords, runs, type Target } from "@/lib/db/schema";
import {
  computeTargetProgress,
  type TargetProgress,
  type TargetDirection,
} from "./target-progress";

export class TargetNotFoundError extends Error {
  constructor(id: number) {
    super(`Target not found: id=${id}`);
    this.name = "TargetNotFoundError";
  }
}

// Metrics whose current value is computed live from the pipeline's own output.
// 'manual' (handled separately) uses the operator-entered value.
export const TARGET_METRICS = [
  { key: "articles_published", label: "Articles published", direction: "increase" },
  { key: "articles_total", label: "Articles drafted (any status)", direction: "increase" },
  { key: "keywords_approved", label: "Keywords approved", direction: "increase" },
  { key: "runs_succeeded", label: "Successful agent runs", direction: "increase" },
  { key: "technical_seo_score", label: "Technical SEO score (run the agent)", direction: "increase" },
  { key: "manual", label: "Manual (I enter the value)", direction: "increase" },
] as const;

export type TargetMetric = (typeof TARGET_METRICS)[number]["key"];

export interface TargetCreateInput {
  siteId: number;
  title: string;
  metric: TargetMetric | string;
  direction?: TargetDirection;
  baselineValue: number;
  goalValue: number;
  manualCurrent?: number | null;
  startAt?: Date;
  deadlineAt: Date;
}

export interface TargetUpdateInput {
  title?: string;
  goalValue?: number;
  baselineValue?: number;
  manualCurrent?: number | null;
  deadlineAt?: Date;
  status?: string;
}

export type TargetWithProgress = Target & {
  current: number;
  progress: TargetProgress;
};

/**
 * Compact summary of a site's ACTIVE targets for injection into the Director's
 * system prompt, so the planner knows the live objectives + their status and
 * can prioritize work that moves a slipping target. Returns "" when there are
 * no active targets.
 */
export function formatTargetsForPrompt(
  targets: Array<{ title: string; status: string; progress: TargetProgress }>,
): string {
  const live = targets.filter((t) => t.status === "active");
  if (live.length === 0) return "";
  const lines = live.slice(0, 8).map((t) => {
    const p = t.progress;
    const days = Math.max(0, Math.round(p.daysRemaining));
    return `- "${t.title}" — ${Math.round(p.progressPct)}% of goal, ${p.status.toUpperCase()}, ${days} day(s) left (pace ${p.actualPerDay.toFixed(2)}/day vs ${p.requiredPerDay.toFixed(2)} needed)`;
  });
  return [
    "ACTIVE TARGETS (objectives for this site — factor these into every plan)",
    ...lines,
    "When the user asks what to do next, prioritize work that moves an OFF-TRACK or AT-RISK target toward its goal.",
  ].join("\n");
}

async function countWhere(
  table: typeof articles | typeof keywords | typeof runs,
  cond: ReturnType<typeof and> | ReturnType<typeof eq>,
): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ n: count() }).from(table).where(cond);
  return row?.n ?? 0;
}

/** Read the current absolute value for a target's metric (live). */
export async function computeCurrentValue(target: Target): Promise<number> {
  switch (target.metric) {
    case "articles_published":
      return countWhere(articles, and(eq(articles.siteId, target.siteId), eq(articles.status, "published")));
    case "articles_total":
      return countWhere(articles, eq(articles.siteId, target.siteId));
    case "keywords_approved":
      return countWhere(keywords, and(eq(keywords.siteId, target.siteId), eq(keywords.status, "approved")));
    case "runs_succeeded":
      return countWhere(runs, and(eq(runs.siteId, target.siteId), eq(runs.status, "success")));
    case "technical_seo_score": {
      // Closed loop: the latest successful Technical SEO audit's score IS the
      // current value, so running that agent moves this target's progress.
      const db = getDb();
      const [row] = await db
        .select({ result: runs.result })
        .from(runs)
        .where(
          and(
            eq(runs.siteId, target.siteId),
            eq(runs.subjectKey, "agent.technical-seo"),
            eq(runs.status, "success"),
          ),
        )
        .orderBy(desc(runs.id))
        .limit(1);
      const score = (row?.result as { score?: unknown } | null)?.score;
      return typeof score === "number" ? score : 0;
    }
    case "manual":
    default:
      return target.manualCurrent ?? 0;
  }
}

function attachProgress(target: Target, current: number, nowMs: number): TargetWithProgress {
  const progress = computeTargetProgress({
    baseline: target.baselineValue,
    goal: target.goalValue,
    current,
    direction: (target.direction as TargetDirection) ?? "increase",
    startMs: (target.startAt as Date).getTime(),
    deadlineMs: (target.deadlineAt as Date).getTime(),
    nowMs,
  });
  return { ...target, current, progress };
}

export async function createTarget(input: TargetCreateInput): Promise<Target> {
  const db = getDb();
  const [row] = await db
    .insert(targets)
    .values({
      siteId: input.siteId,
      title: input.title,
      metric: input.metric,
      direction: input.direction ?? "increase",
      baselineValue: input.baselineValue,
      goalValue: input.goalValue,
      manualCurrent: input.manualCurrent ?? null,
      startAt: input.startAt ?? new Date(),
      deadlineAt: input.deadlineAt,
    })
    .returning();
  return row;
}

export async function listTargets(siteId: number): Promise<Target[]> {
  const db = getDb();
  return db.select().from(targets).where(eq(targets.siteId, siteId)).orderBy(desc(targets.id));
}

export async function getTarget(id: number): Promise<Target | null> {
  const db = getDb();
  const [row] = await db.select().from(targets).where(eq(targets.id, id)).limit(1);
  return row ?? null;
}

export async function updateTarget(id: number, patch: TargetUpdateInput): Promise<Target> {
  const db = getDb();
  const [row] = await db
    .update(targets)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(targets.id, id))
    .returning();
  if (!row) throw new TargetNotFoundError(id);
  return row;
}

export async function deleteTarget(id: number): Promise<void> {
  const db = getDb();
  await db.delete(targets).where(eq(targets.id, id));
}

/** A single target with its live current value + progress vector. */
export async function getTargetWithProgress(
  target: Target,
  nowMs: number = Date.now(),
): Promise<TargetWithProgress> {
  const current = await computeCurrentValue(target);
  return attachProgress(target, current, nowMs);
}

/** All of a site's targets, each with live progress, freshest first. */
export async function listTargetsWithProgress(
  siteId: number,
  nowMs: number = Date.now(),
): Promise<TargetWithProgress[]> {
  const rows = await listTargets(siteId);
  return Promise.all(rows.map((t) => getTargetWithProgress(t, nowMs)));
}
