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
  /** When true the Run form requires a value and the live-stream button is hidden. */
  required?: boolean;
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
  // Inline (fn) text linters — paste an article OR leave it blank to review the
  // live page (LO-04: a URL override, else the site's homepage).
  qa: [
    { name: "article", label: "Article (markdown or text)", type: "textarea", placeholder: "Paste a draft, or leave blank to QA the live page…" },
    { ...urlOverride, label: "…or live URL to QA (optional)" },
    { name: "targetKeyword", label: "Target keyword (optional)", type: "text", placeholder: "e.g. textile manufacturing" },
  ],
  "seo-optimization": [
    { name: "article", label: "Article (markdown or text)", type: "textarea", placeholder: "Paste a draft, or leave blank to lint the live page…" },
    { ...urlOverride, label: "…or live URL to lint (optional)" },
    { name: "targetKeyword", label: "Target keyword (optional)", type: "text", placeholder: "e.g. textile manufacturing" },
  ],
  critic: [
    { name: "output", label: "Output to review", type: "textarea", placeholder: "Paste the agent output (keywords, brief, draft, outreach…) to critique", required: true },
    { name: "goal", label: "End goal (optional)", type: "text", placeholder: "e.g. rank #1 for 'textile manufacturing'" },
    { name: "agentKey", label: "Producing agent (optional)", type: "text", placeholder: "e.g. content-writing" },
  ],
  // Worker (Railway) agents — required fields the worker validates (raises ValueError otherwise).
  "idea-generation": [
    {
      name: "keywords",
      label: "Seed keywords (one per line)",
      type: "textarea",
      placeholder: "textile manufacturing\nB2B sourcing",
      help: "Runs on the browser worker — each keyword yields a few content ideas.",
      required: true,
    },
  ],
  "content-writing": [
    { name: "title", label: "Working title", type: "text", placeholder: "The B2B Buyer's Guide to Textile Manufacturing", required: true },
    { name: "brief", label: "Brief / outline", type: "textarea", placeholder: "Audience, angle, key sections to cover…", required: true, help: "Runs on the browser worker (AI Studio drafting)." },
    { name: "targetKeyword", label: "Target keyword (optional)", type: "text" },
  ],
  backlink: [
    { name: "targetSite", label: "Target site / domain", type: "text", placeholder: "example.com", required: true },
    { name: "ourValue", label: "Why they should link to us", type: "textarea", placeholder: "The unique value our page offers their readers…", required: true },
    { name: "context", label: "Context (their page / topic)", type: "textarea", placeholder: "Which of their pages, and why it's relevant…", required: true },
  ],
  research: [
    {
      name: "seeds",
      label: "Seed topics (one per line, optional)",
      type: "textarea",
      placeholder: "defaults to the site's niche",
      help: "Runs on the browser worker.",
    },
  ],
  "tactics-scraper": [
    {
      name: "sources",
      label: "Source URLs (one per line, optional)",
      type: "textarea",
      placeholder: "https://www.reddit.com/r/SEO/\nhttps://news.ycombinator.com/\n(blank = the 6 default communities)",
      help: "Reddit / HN / forum / blog / X URLs. Runs on the browser worker.",
    },
    {
      name: "notebooklmUrl",
      label: "…or a video/podcast/Reel URL (NotebookLM)",
      type: "url",
      placeholder: "https://youtu.be/…  — extracted in a NotebookLM session, zero Gemini API",
    },
  ],
};

export function inputsForAgent(key: string): AgentInputField[] {
  return AGENT_INPUTS[key] ?? [];
}

/**
 * True when an agent has a required pasted input (e.g. qa/seo need an article).
 * The live-stream "Run live" button can only pass a siteId, so it is hidden for
 * these — they must run through the input-bearing Run form instead.
 */
export function requiresPastedInput(key: string): boolean {
  return inputsForAgent(key).some((f) => f.required);
}
