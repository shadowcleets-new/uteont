import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cycles } from "@/lib/db/schema";

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
