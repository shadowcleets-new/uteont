import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cycles } from "@/lib/db/schema";

export async function createCycle(goal: string, seedTerms: string[]) {
  const db = getDb();
  const [row] = await db
    .insert(cycles)
    .values({ goal, seedTerms, status: "researching" })
    .returning();
  return row;
}

export async function listCycles(limit = 50) {
  const db = getDb();
  return db.select().from(cycles).orderBy(desc(cycles.id)).limit(limit);
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
