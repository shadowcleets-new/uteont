"use server";

import { revalidatePath } from "next/cache";
import { setAgentPaused } from "@/lib/services/agent-state";

/** Pause or resume an agent (the `paused` hidden field carries the target state). */
export async function pauseAgentAction(formData: FormData): Promise<void> {
  const agentKey = String(formData.get("agentKey") ?? "").trim();
  const paused = String(formData.get("paused") ?? "") === "true";
  if (!agentKey) return;
  await setAgentPaused(agentKey, paused);
  revalidatePath("/settings");
}
