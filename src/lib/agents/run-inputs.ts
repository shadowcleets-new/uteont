/**
 * Per-agent run inputs — the single source of truth for which payload fields
 * each agent exposes in its Run form. The run-redirect route reads the same
 * field names and threads them into the dispatched payload, so the inline
 * runners (agent-runners/index.ts) receive them.
 *
 * Agents not listed here take no extra inputs (just the site).
 */

export interface AgentInputField {
  name: string;
  label: string;
  type: "text" | "url" | "textarea";
  placeholder?: string;
  help?: string;
}

const urlOverride: AgentInputField = {
  name: "url",
  label: "URL to analyze (optional)",
  type: "url",
  placeholder: "defaults to the site's homepage",
};

export const AGENT_INPUTS: Record<string, AgentInputField[]> = {
  "technical-seo": [urlOverride],
  "content-audit": [urlOverride],
  "site-crawl": [{ ...urlOverride, label: "Start URL (optional)" }],
  revenue: [urlOverride],
  "content-brief": [
    { ...urlOverride, label: "Your page URL (optional)" },
    {
      name: "competitors",
      label: "Competitor URLs (one per line)",
      type: "textarea",
      placeholder: "https://competitor-a.com/page\nhttps://competitor-b.com/page",
      help: "When given, the brief compares your page against these to find the terms + topics they cover and you don't.",
    },
  ],
  "content-draft": [
    { name: "topic", label: "Topic", type: "text", placeholder: "e.g. B2B textile manufacturing — a buyer's guide" },
    { name: "keyword", label: "Primary keyword (optional)", type: "text", placeholder: "e.g. textile manufacturing" },
  ],
};

export function inputsForAgent(key: string): AgentInputField[] {
  return AGENT_INPUTS[key] ?? [];
}
