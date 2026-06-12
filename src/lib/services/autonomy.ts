/**
 * @file autonomy.ts
 * @description Autonomy levels L1–L4 (LO-20) — the guardrail envelope that
 * decides whether the Director may dispatch an agent without a human in the
 * loop. Sits on TOP of the per-batch approval gate (LO-55): autonomy decides
 * how much the operator's standing policy lets the Director do on its own.
 *
 *   L1  propose-only      — never dispatches from chat; the operator runs agents
 *   L2  approval-required — dispatches any agent only with an explicit per-batch go (default)
 *   L3  supervised-auto   — auto-runs low-blast-radius agents; gates high-blast on approval
 *   L4  full-auto         — auto-runs everything
 *
 * Level is read from kv_settings via app-settings.getAutonomyLevel().
 */

import type { AutonomyLevel } from "./app-settings";

/** Agents that only read or draft (no outward/irreversible effect) → low blast. */
const LOW_BLAST_AGENTS = new Set([
  "research", "idea-generation", "content-brief", "content-draft",
  "technical-seo", "content-audit", "site-crawl", "performance-tracking",
  "revenue", "qa", "seo-optimization", "critic", "tactics-scraper",
]);

export function isLowBlastRadius(agentKey: string): boolean {
  return LOW_BLAST_AGENTS.has(agentKey);
}

/**
 * Whether the Director may dispatch `agentKey` given the autonomy level and
 * whether the user explicitly approved this batch. Pure + tested.
 */
export function autonomyAllowsDispatch(
  level: AutonomyLevel,
  agentKey: string,
  userApprovedThisTurn: boolean,
): boolean {
  switch (level) {
    case "L1":
      return false; // propose-only — the operator dispatches manually
    case "L2":
      return userApprovedThisTurn;
    case "L3":
      return userApprovedThisTurn || isLowBlastRadius(agentKey);
    case "L4":
      return true;
    default:
      return userApprovedThisTurn; // unknown → safest non-trivial policy (L2)
  }
}
