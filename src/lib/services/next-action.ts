/**
 * "Next best action" recommendation.
 *
 * Pure: given a site's targets (each with its live trajectory), pick the single
 * most valuable thing to do right now and route it to the exact agent that
 * moves that target's metric. This is the advice side of the closed loop — the
 * dashboard turns "you have a slipping objective" into "run THIS agent".
 */

import type { Target } from "@/lib/db/schema";
import type { TargetProgress } from "./target-progress";

/** Minimal shape this needs from a target-with-progress (TargetWithProgress satisfies it). */
export type RankableTarget = Pick<Target, "id" | "title" | "metric" | "status"> & {
  progress: Pick<TargetProgress, "status" | "progressPct" | "daysRemaining">;
};

export interface NextAction {
  targetId: number;
  targetTitle: string;
  status: TargetProgress["status"];
  /** Where the CTA navigates (an agent run page, or the targets page for manual). */
  href: string;
  /** Button label, e.g. "Run Technical SEO". */
  cta: string;
  /** What to do, phrased as an imperative outcome. */
  suggestion: string;
}

// Worse trajectory status sorts first (lower rank = more urgent).
const STATUS_RANK: Record<TargetProgress["status"], number> = {
  "off-track": 0,
  "at-risk": 1,
  "on-track": 2,
  hit: 3,
};

// Metric -> the agent that moves it + how to phrase the suggestion.
const METRIC_ROUTE: Record<string, { agentKey: string | null; label: string; verb: string }> = {
  technical_seo_score: { agentKey: "technical-seo", label: "Technical SEO", verb: "run a Technical SEO audit to raise the score" },
  content_score: { agentKey: "content-audit", label: "Content Audit", verb: "run a Content Audit to raise the on-page score" },
  site_structure_score: { agentKey: "site-crawl", label: "Site Crawl", verb: "run a Site Crawl to fix orphan and thin-linking pages" },
  revenue_score: { agentKey: "revenue", label: "Revenue Optimization", verb: "run a conversion audit and add clear CTAs / money-page links" },
  content_brief_score: { agentKey: "content-brief", label: "Content Brief", verb: "run a content brief and fill the missing terms + topics" },
  gsc_clicks: { agentKey: "performance-tracking", label: "Performance Tracking", verb: "pull fresh Search Console data and grow clicks with new content" },
  gsc_impressions: { agentKey: "performance-tracking", label: "Performance Tracking", verb: "pull fresh Search Console data and expand keyword coverage" },
  articles_published: { agentKey: "content-writing", label: "Content Writing", verb: "draft more content to grow the publishing pipeline" },
  articles_total: { agentKey: "content-writing", label: "Content Writing", verb: "draft a new article" },
  keywords_approved: { agentKey: "research", label: "Research", verb: "run research, then approve the strongest keywords" },
  runs_succeeded: { agentKey: "research", label: "Research", verb: "run an agent to make measurable progress" },
  manual: { agentKey: null, label: "", verb: "update the current value" },
};

const FALLBACK = { agentKey: null as string | null, label: "", verb: "make progress on this objective" };

/**
 * Pick the highest-priority action across a site's targets, or null when there's
 * nothing to nudge (no active targets, or every active target is already hit).
 * Priority: worst trajectory status, then soonest deadline, then lowest progress.
 */
export function pickNextAction(targets: RankableTarget[]): NextAction | null {
  const candidates = targets.filter((t) => t.status === "active" && t.progress.status !== "hit");
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const byStatus = STATUS_RANK[a.progress.status] - STATUS_RANK[b.progress.status];
    if (byStatus !== 0) return byStatus;
    if (a.progress.daysRemaining !== b.progress.daysRemaining) {
      return a.progress.daysRemaining - b.progress.daysRemaining;
    }
    return a.progress.progressPct - b.progress.progressPct;
  });

  const t = sorted[0];
  const route = METRIC_ROUTE[t.metric] ?? FALLBACK;
  const href = route.agentKey ? `/agents/${route.agentKey}` : "/targets";
  const cta = route.agentKey ? `Run ${route.label}` : "Update on Targets";
  const days = Math.max(0, Math.round(t.progress.daysRemaining));
  const suggestion = `To move it, ${route.verb} — ${days} day${days === 1 ? "" : "s"} left.`;

  return {
    targetId: t.id,
    targetTitle: t.title,
    status: t.progress.status,
    href,
    cta,
    suggestion,
  };
}
