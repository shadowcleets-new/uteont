/**
 * Per-agent runtime state (pause/resume). Backs the operable controls on
 * /settings and is enforced at dispatch (runAgent + dispatchAgentJob). Reads
 * fail OPEN — a transient DB issue must never block every agent run — while the
 * write path surfaces errors so the UI can report a failed toggle.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentState, type AgentState } from "@/lib/db/schema";

export async function listAgentStates(): Promise<AgentState[]> {
  try {
    return await getDb().select().from(agentState);
  } catch (e) {
    console.warn("listAgentStates failed", e);
    return [];
  }
}

/** Set of agentKeys currently paused (empty on any read failure). */
export async function pausedAgentKeys(): Promise<Set<string>> {
  const rows = await listAgentStates();
  return new Set(rows.filter((r) => r.paused).map((r) => r.agentKey));
}

export async function isAgentPaused(agentKey: string): Promise<boolean> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ paused: agentState.paused })
      .from(agentState)
      .where(and(eq(agentState.agentKey, agentKey), eq(agentState.paused, true)))
      .limit(1);
    return Boolean(row);
  } catch (e) {
    // Fail OPEN — never block a run because state is unreadable — but log the
    // DB error so the swallowed blip is observable (a missing table is just
    // "not provisioned yet"; anything else is a real, surfaceable error).
    const msg = e instanceof Error ? e.message : String(e);
    if (/relation .* does not exist/i.test(msg) || msg.includes("42P01")) {
      console.warn(`isAgentPaused(${agentKey}): agent_state table missing (failing open)`, e);
    } else {
      console.warn(`isAgentPaused(${agentKey}): DB error (failing open)`, e);
    }
    return false;
  }
}

export async function setAgentPaused(
  agentKey: string,
  paused: boolean,
  pauseReason?: string | null,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(agentState)
    .values({ agentKey, paused, pauseReason: pauseReason ?? null, updatedAt: now })
    .onConflictDoUpdate({
      target: agentState.agentKey,
      set: { paused, pauseReason: pauseReason ?? null, updatedAt: now },
    });
}

/** Throw if the agent is paused — the dispatch-time guard. */
export async function assertAgentNotPaused(agentKey: string): Promise<void> {
  if (await isAgentPaused(agentKey)) {
    throw new Error(`Agent '${agentKey}' is paused — resume it in Settings to run it.`);
  }
}
