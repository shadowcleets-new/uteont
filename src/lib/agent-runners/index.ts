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

export interface InlineRunnerContext {
  payload: Record<string, unknown>;
}

export interface InlineRunnerResult {
  result: Record<string, unknown>;
}

export type InlineRunner = (ctx: InlineRunnerContext) => Promise<InlineRunnerResult>;

export const INLINE_RUNNERS: Record<string, InlineRunner> = {
  qa: async ({ payload }) => {
    const article = String(payload.article ?? "").trim();
    if (!article) throw new Error("qa requires 'article' in payload");
    const targetKeyword = payload.targetKeyword ? String(payload.targetKeyword) : undefined;
    const result = validate({ article, targetKeyword });
    return { result: result as unknown as Record<string, unknown> };
  },
  "seo-optimization": async ({ payload }) => {
    const article = String(payload.article ?? "").trim();
    if (!article) throw new Error("seo-optimization requires 'article' in payload");
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
