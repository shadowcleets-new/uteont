"use server";

import { revalidatePath } from "next/cache";
import { findAgent } from "@/lib/agents/registry";
import { setAgentPaused } from "@/lib/services/agent-state";

/** Pause or resume an agent (the `paused` hidden field carries the target state). */
export async function pauseAgentAction(formData: FormData): Promise<void> {
  const agentKey = String(formData.get("agentKey") ?? "").trim();
  const paused = String(formData.get("paused") ?? "") === "true";
  // Only known agent keys — stops an authenticated operator from polluting
  // agent_state (a text primary key) with arbitrary keys via a crafted form.
  if (!findAgent(agentKey)) return;
  await setAgentPaused(agentKey, paused);
  revalidatePath("/settings");
}
