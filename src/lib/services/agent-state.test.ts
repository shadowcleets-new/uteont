import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentState } from "@/lib/db/schema";
import { setAgentPaused, isAgentPaused, pausedAgentKeys } from "./agent-state";

const KEY = `__test_pause_${Math.random().toString(36).slice(2)}`;

afterEach(async () => {
  try {
    await getDb().delete(agentState).where(eq(agentState.agentKey, KEY));
  } catch {
    /* ignore cleanup errors */
  }
});

describe("agent-state (live DB)", () => {
  it("defaults to not-paused for an agent with no state row", async () => {
    expect(await isAgentPaused(KEY)).toBe(false);
  });

  it("pauses then resumes an agent (upsert round-trip)", async () => {
    await setAgentPaused(KEY, true, "testing");
    expect(await isAgentPaused(KEY)).toBe(true);
    expect([...(await pausedAgentKeys())]).toContain(KEY);

    await setAgentPaused(KEY, false);
    expect(await isAgentPaused(KEY)).toBe(false);
    expect([...(await pausedAgentKeys())]).not.toContain(KEY);
  });
});
