/**
 * Inline-runnable agent registry. Maps agent key → runner function.
 *
 * Only agents whose runtime is "fn" (Vercel serverless) belong here.
 * Worker-runtime agents get enqueued as jobs instead.
 */

import { validate } from "./qa";
import { optimize } from "./seo-optimization";
import { runTechnicalSeo } from "./technical-seo";
import { runContentAudit } from "./content-audit";
import { runSiteCrawl } from "./site-crawl";
import { runPerformanceTracking } from "./performance-tracking";
import { runRevenue } from "./revenue";
import { runContentBrief } from "./content-brief";
import { runContentDraft } from "./content-draft";
import { runCritique, recordCritique } from "@/lib/services/critic";
import { getCriticStrictness } from "@/lib/services/app-settings";
import { remainingBudgetFraction } from "@/lib/services/gemini-budget";

export interface InlineRunnerContext {
  payload: Record<string, unknown>;
}

export interface InlineRunnerResult {
  result: Record<string, unknown>;
}

export type InlineRunner = (ctx: InlineRunnerContext) => Promise<InlineRunnerResult>;

export const INLINE_RUNNERS: Record<string, InlineRunner> = {
  qa: async ({ payload }) => {
    // LO-04: review the live page when no article is pasted but a url/site is.
    const article = await resolveReviewText(payload, "qa");
    const targetKeyword = payload.targetKeyword ? String(payload.targetKeyword) : undefined;
    const result = validate({ article, targetKeyword });
    return { result: result as unknown as Record<string, unknown> };
  },
  "seo-optimization": async ({ payload }) => {
    const article = await resolveReviewText(payload, "seo-optimization");
    const targetKeyword = payload.targetKeyword ? String(payload.targetKeyword) : undefined;
    const result = optimize({ article, targetKeyword });
    return { result: result as unknown as Record<string, unknown> };
  },
  "technical-seo": async ({ payload }) => {
    const site = (payload.site ?? {}) as Record<string, unknown>;
    const url = String(payload.url ?? site.domain ?? "").trim();
    if (!url) throw new Error("technical-seo requires a site domain or 'url' in payload");
    const result = await runTechnicalSeo(url);
    return { result: result as unknown as Record<string, unknown> };
  },
  "content-audit": async ({ payload }) => {
    const site = (payload.site ?? {}) as Record<string, unknown>;
    const url = String(payload.url ?? site.domain ?? "").trim();
    if (!url) throw new Error("content-audit requires a site domain or 'url' in payload");
    const result = await runContentAudit(url);
    return { result: result as unknown as Record<string, unknown> };
  },
  "site-crawl": async ({ payload }) => {
    const site = (payload.site ?? {}) as Record<string, unknown>;
    const url = String(payload.url ?? site.domain ?? "").trim();
    if (!url) throw new Error("site-crawl requires a site domain or 'url' in payload");
    const result = await runSiteCrawl(url);
    return { result: result as unknown as Record<string, unknown> };
  },
  "performance-tracking": async ({ payload }) => {
    const site = (payload.site ?? {}) as Record<string, unknown>;
    const siteId = Number(site.id ?? payload.siteId ?? 0);
    if (!Number.isFinite(siteId) || siteId <= 0) throw new Error("performance-tracking requires a site");
    const result = await runPerformanceTracking(siteId, String(site.domain ?? ""));
    return { result: result as unknown as Record<string, unknown> };
  },
  revenue: async ({ payload }) => {
    const site = (payload.site ?? {}) as Record<string, unknown>;
    const url = String(payload.url ?? site.domain ?? "").trim();
    if (!url) throw new Error("revenue requires a site domain or 'url' in payload");
    const result = await runRevenue(url);
    return { result: result as unknown as Record<string, unknown> };
  },
  "content-brief": async ({ payload }) => {
    const site = (payload.site ?? {}) as Record<string, unknown>;
    const url = String(payload.url ?? site.domain ?? "").trim();
    if (!url) throw new Error("content-brief requires a site domain or 'url' in payload");
    const competitors = Array.isArray(payload.competitors) ? payload.competitors.map(String) : [];
    const result = await runContentBrief(url, competitors);
    // Explainability: record WHY the brief recommends what it does (best-effort).
    try {
      const { recordDecision } = await import("@/lib/services/decision-records");
      await recordDecision({
        siteId: Number(site.id) || null,
        subjectKey: "agent.content-brief",
        kind: "recommendation",
        title: `Content brief for ${url}`,
        rationale:
          result.mode === "competitive"
            ? `Cover ${result.missingTerms.length} term(s) competitors rank for; target ${result.recommendedWordCount} words.`
            : `Baseline coverage ${result.score}/100; target ${result.recommendedWordCount} words.`,
        confidence: result.score / 100,
        evidence: result.missingTerms.slice(0, 8).map((t) => ({ label: "missing term", value: t })),
        inputs: { url, competitors },
      });
    } catch {
      /* explainability is best-effort */
    }
    return { result: result as unknown as Record<string, unknown> };
  },
  critic: async ({ payload }) => {
    // Manual critique of pasted output: judge `output` against `goal`.
    const output = String(payload.output ?? payload.article ?? "").trim();
    if (!output) throw new Error("critic requires 'output' (the text to review) in payload");
    const endGoal = String(payload.goal ?? payload.endGoal ?? "").trim();
    const agentKey = String(payload.agentKey ?? "content-writing");
    const strictness = await getCriticStrictness();
    const budgetFraction = await remainingBudgetFraction();
    // A manual run always reviews regardless of the auto target-agent set.
    const result = await runCritique({ agentKey, endGoal, output, strictness, budgetFraction, force: true });
    const site = (payload.site ?? {}) as Record<string, unknown>;
    await recordCritique({
      siteId: typeof site.id === "number" ? site.id : null,
      agentKey,
      endGoal,
      result,
    });
    return { result: result as unknown as Record<string, unknown> };
  },
  "content-draft": async ({ payload }) => {
    const site = (payload.site ?? {}) as Record<string, unknown>;
    const topic =
      String(payload.topic ?? site.niche ?? site.name ?? "").trim() ||
      `${site.name ?? "the site"} — a getting-started guide`;
    const result = await runContentDraft({
      topic,
      keyword: payload.keyword ? String(payload.keyword) : undefined,
      missingTerms: Array.isArray(payload.missingTerms) ? payload.missingTerms.map(String) : undefined,
      missingTopics: Array.isArray(payload.missingTopics) ? payload.missingTopics.map(String) : undefined,
      recommendedWordCount: typeof payload.recommendedWordCount === "number" ? payload.recommendedWordCount : undefined,
      voice: site.voiceGuide ? String(site.voiceGuide) : undefined,
      bannedPhrases: Array.isArray(site.bannedPhrases) ? site.bannedPhrases.map(String) : undefined,
    });
    return { result: result as unknown as Record<string, unknown> };
  },
};

export function hasInlineRunner(agentKey: string): boolean {
  return agentKey in INLINE_RUNNERS;
}

/**
 * LO-04: resolve the text the QA / SEO-Optimization linters operate on. Prefers
 * a pasted `article`; otherwise fetches the live page (url override or the
 * site's homepage) and extracts its text — so these agents can run one-click
 * against the live site like the audit agents do.
 */
async function resolveReviewText(payload: Record<string, unknown>, agentKey: string): Promise<string> {
  const article = String(payload.article ?? "").trim();
  if (article) return article;
  const site = (payload.site ?? {}) as Record<string, unknown>;
  const url = String(payload.url ?? site.domain ?? "").trim();
  if (!url) {
    throw new Error(`${agentKey} requires either an 'article' to review or a site/url to fetch`);
  }
  const { fetchPageText } = await import("@/lib/agents/page-text");
  const text = await fetchPageText(url);
  if (!text) {
    throw new Error(`${agentKey}: could not fetch readable text from ${url}`);
  }
  return text;
}
