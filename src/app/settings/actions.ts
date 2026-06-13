"use server";

import { revalidatePath } from "next/cache";
import { findAgent } from "@/lib/agents/registry";
import { setAgentPaused } from "@/lib/services/agent-state";
import {
  setCriticStrictness,
  setAutonomyLevel,
  setOutreachAllowlist,
  isAutonomyLevel,
} from "@/lib/services/app-settings";
import { isCritiqueStrictness } from "@/lib/services/critic";
import { extractDomain } from "@/lib/services/outreach-allowlist";

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

/** LO-60: set the Critic strictness mode. */
export async function setCriticStrictnessAction(formData: FormData): Promise<void> {
  const value = String(formData.get("strictness") ?? "");
  if (!isCritiqueStrictness(value)) return;
  await setCriticStrictness(value);
  revalidatePath("/settings");
}

/** LO-20: set the Director autonomy level. */
export async function setAutonomyLevelAction(formData: FormData): Promise<void> {
  const value = String(formData.get("level") ?? "");
  if (!isAutonomyLevel(value)) return;
  await setAutonomyLevel(value);
  revalidatePath("/settings");
}

/** LO-58: replace the outreach domain allowlist (one domain per line). */
export async function setOutreachAllowlistAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("domains") ?? "");
  const domains = Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((d) => extractDomain(d) ?? "")
        .filter(Boolean),
    ),
  );
  await setOutreachAllowlist(domains);
  revalidatePath("/settings");
}
