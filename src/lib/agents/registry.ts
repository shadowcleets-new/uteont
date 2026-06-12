/**
 * Agent registry — the agents in the UTEONT pipeline.
 *
 * `implemented` indicates whether a runner currently exists (either as a
 * Vercel serverless function or as a job picked up by the worker).
 *
 * `runtime` tells the frontend where this agent runs:
 *   - "fn"     → Vercel serverless function (fast, stateless)
 *   - "worker" → browser worker (long-running, Playwright + AI Studio)
 */

export type AgentRuntime = "fn" | "worker";

export interface AgentSpec {
  key: string;
  name: string;
  sidebarLabel: string;
  description: string;
  runtime: AgentRuntime;
  implemented: boolean;
}

export const AGENTS: AgentSpec[] = [
  {
    key: "research",
    name: "Research Agent",
    sidebarLabel: "1. Research",
    description:
      "Discovers keyword opportunities using free signals (Google Trends, Wikipedia, optional Reddit). Outputs a ranked keyword list consumed by Idea Generation.",
    runtime: "worker",
    implemented: true,
  },
  {
    key: "idea-generation",
    name: "Idea Generation Agent",
    sidebarLabel: "2. Idea Generation",
    description:
      "Converts keyword clusters into article angles + briefs via Gemini (free tier). Output gates at Idea Selection.",
    runtime: "worker",
    implemented: true,
  },
  {
    key: "content-writing",
    name: "Content Writing Agent",
    sidebarLabel: "3. Content Writing",
    description:
      "Drafts full articles from approved briefs via Gemini (free tier). Output: markdown drafts with auto-generated meta title/description.",
    runtime: "worker",
    implemented: true,
  },
  {
    key: "qa",
    name: "QA / Validation Agent",
    sidebarLabel: "4. QA / Validation",
    description:
      "Deterministic pre-review checks on article markdown: readability (Flesch), passive voice, policy / forbidden phrases, target keyword presence.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "seo-optimization",
    name: "SEO Optimization Agent",
    sidebarLabel: "5. SEO Optimization",
    description:
      "Deterministic SEO lint of an article: title, heading hierarchy, word count, keyword density. Generates suggested meta description and JSON-LD Article schema.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "technical-seo",
    name: "Technical SEO Agent",
    sidebarLabel: "6. Technical SEO",
    description:
      "Deterministic technical-SEO audit of the live site: HTTPS, title/meta description, mobile viewport, canonical, single H1, JSON-LD, Open Graph, image alt coverage, robots.txt + sitemap.xml. Reads only public URLs — no credentials needed.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "content-audit",
    name: "Content Audit Agent",
    sidebarLabel: "7. Content Audit",
    description:
      "Deterministic on-page content audit of the live site: content depth (word count), heading structure, internal linking, scannability (lists/tables), readability, and imagery. Reads only public HTML — no credentials needed.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "site-crawl",
    name: "Site Crawl Agent",
    sidebarLabel: "8. Site Crawl",
    description:
      "Crawls the site's own sitemap (or homepage links), builds the internal link graph, and flags structural SEO problems: orphan pages nothing links to and thin-linking pages. Reads only public HTML — no credentials needed.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "publishing",
    name: "Publishing Agent",
    sidebarLabel: "9. Publishing",
    description:
      "Pushes content to staging only. Production publish requires explicit human approval at Production gate.",
    runtime: "fn",
    implemented: false,
  },
  {
    key: "backlink",
    name: "Backlink / Outreach Agent",
    sidebarLabel: "10. Backlink / Outreach",
    description:
      "Drafts personalized outreach emails via Gemini (free tier). Never sends — all messages require explicit human approval before going out.",
    runtime: "worker",
    implemented: true,
  },
  {
    key: "performance-tracking",
    name: "Performance Tracking Agent",
    sidebarLabel: "11. Performance Tracking",
    description:
      "Pulls real Google Search Console metrics (clicks, impressions, CTR, position) for the site once connected. Feeds the gsc_clicks / gsc_impressions target metrics. Degrades gracefully with a clear prompt until Search Console is connected.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "revenue",
    name: "Revenue Optimization Agent",
    sidebarLabel: "12. Revenue Optimization",
    description:
      "Conversion audit of the live page: clear CTAs, a path to a money page (pricing/contact/checkout), lead capture, and trust signals. Reads only public HTML — no credentials needed. Scores the revenue_score metric.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "content-brief",
    name: "Content Brief Agent",
    sidebarLabel: "13. Content Brief",
    description:
      "Reverse-engineers the topic: profiles your page (and competitor URLs when given) into heading outline / terms / entities, then computes the brief — recommended length, missing terms + topics, and an information-gain read. Public HTML only — no SERP API needed. Scores content_brief_score.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "content-draft",
    name: "Content Draft Agent",
    sidebarLabel: "14. Content Draft",
    description:
      "Generates a full SEO draft inline via Gemini — title, meta title/description, outline, and markdown body — optionally fed by a Content Brief's missing terms/topics and the site's voice. Runs on Vercel (no worker); needs GEMINI_API_KEY.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "critic",
    name: "Critic Agent",
    sidebarLabel: "15. Critic",
    description:
      "Single-purpose reviewer: judges a producing agent's terminal output against the end goal and returns a binary verdict — serves (ship) or fails (one concrete fix). Runs automatically after the producing agents and can also review pasted output. Strictness (loose/standard/pedantic) is set in Settings; quota-aware (stands down when the daily Gemini budget is low). Needs GEMINI_API_KEY.",
    runtime: "fn",
    implemented: true,
  },
  {
    key: "tactics-scraper",
    name: "Tactics Scraper Agent",
    sidebarLabel: "16. Tactics Scraper",
    description:
      "Scrapes marketing/SEO communities (r/SEO, r/bigseo, Hacker News, forums, blogs, X) and distills current tactics into the knowledge base that Idea Generation and the Director read during planning. Runs on the browser worker; paste any source URL on the Tactics page.",
    runtime: "worker",
    implemented: true,
  },
];

export function findAgent(key: string): AgentSpec | undefined {
  return AGENTS.find((a) => a.key === key);
}
