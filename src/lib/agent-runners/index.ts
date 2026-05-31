/**
 * Inline-runnable agent registry. Maps agent key → runner function.
 *
 * Only agents whose runtime is "fn" (Vercel serverless) belong here.
 * Worker-runtime agents get enqueued as jobs instead.
 */

import { validate } from "./qa";
import { optimize } from "./seo-optimization";
import { runTechnicalSeo } from "./technical-seo";

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
};

export function hasInlineRunner(agentKey: string): boolean {
  return agentKey in INLINE_RUNNERS;
}
