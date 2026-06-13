import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cycles, keywords, ideas, articles, jobs, runs } from "@/lib/db/schema";

export async function createCycle(goal: string, seedTerms: string[], siteId: number) {
  if (!siteId) {
    throw new Error("createCycle: siteId is required");
  }
  const db = getDb();
  const [row] = await db
    .insert(cycles)
    .values({ goal, seedTerms, siteId, status: "researching" })
    .returning();
  return row;
}

export async function listCycles(opts: { limit?: number; siteId?: number } = {}) {
  const db = getDb();
  const { limit = 50, siteId } = opts;
  const conditions = [];
  if (siteId) conditions.push(eq(cycles.siteId, siteId));
  return db
    .select()
    .from(cycles)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(cycles.id))
    .limit(limit);
}

export async function getCycle(id: number) {
  const db = getDb();
  const [row] = await db.select().from(cycles).where(eq(cycles.id, id)).limit(1);
  return row ?? null;
}

export async function updateCycle(id: number, patch: { goal?: string; status?: string }) {
  const db = getDb();
  const [row] = await db
    .update(cycles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(cycles.id, id))
    .returning();
  return row ?? null;
}

/** LO-70: the entities that carry this cycleId, for the cycle-detail timeline. */
export async function getCycleDetail(id: number) {
  const cycle = await getCycle(id);
  if (!cycle) return null;
  const db = getDb();
  const [kw, idea, art, job, run] = await Promise.all([
    db.select().from(keywords).where(eq(keywords.cycleId, id)).orderBy(desc(keywords.id)).limit(50),
    db.select().from(ideas).where(eq(ideas.cycleId, id)).orderBy(desc(ideas.id)).limit(50),
    db.select().from(articles).where(eq(articles.cycleId, id)).orderBy(desc(articles.id)).limit(50),
    db.select().from(jobs).where(eq(jobs.cycleId, id)).orderBy(desc(jobs.id)).limit(50),
    db.select().from(runs).where(eq(runs.cycleId, id)).orderBy(desc(runs.id)).limit(50),
  ]);
  return { cycle, keywords: kw, ideas: idea, articles: art, jobs: job, runs: run };
}
