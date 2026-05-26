/**
 * Maps an agent to its "natural" quick-export target (used by the
 * ExportButton on each agent page).
 *
 * Most agents export their RUNS filtered to their own subject_key.
 * Research is the exception — its primary output is the keywords table.
 *
 * Returns null if the agent has nothing meaningful to export yet.
 */

import type { AgentSpec } from "./registry";
import type { ExportDomain } from "@/lib/export/types";

export interface AgentExportTarget {
  domain: ExportDomain;
  subject?: string;
  label: string;
}

export function exportTargetFor(agent: AgentSpec): AgentExportTarget | null {
  if (!agent.implemented) return null;

  if (agent.key === "research") {
    return { domain: "keywords", label: "Export keywords" };
  }

  // Default: export this agent's run history
  return {
    domain: "runs",
    subject: `agent.${agent.key}`,
    label: "Export runs",
  };
}
