import { listExclusions } from "@/lib/services/keyword-exclusions";

const BASE_RESEARCH = `You are UTEONT's Research Agent. Surface high-ROI keyword opportunities from free signals — Google Trends, Wikipedia, and (optionally) Reddit. Output a ranked list with search-volume estimate, competition score, source, and a one-sentence rationale per row. Never invent metrics; mark unknowns as 'estimate'.`;

const BASE_IDEATION = `You are UTEONT's Idea Generation Agent. Convert a keyword cluster into 3-5 article angles. Each angle is one sentence; each brief is two paragraphs that name the entities and competitor coverage to outflank. Tag intent as informational | transactional | navigational | commercial.`;

export interface ResearchPromptOptions {
  seedTerms: string[];
  goal?: string;
  locale?: string;
}

export interface IdeationPromptOptions {
  keywords: string[];
  goal?: string;
  audience?: string;
}

function negativeBlock(exclusions: string[]): string {
  if (exclusions.length === 0) return "";
  const list = exclusions
    .map((e) => `"${e}"`)
    .join(", ");
  return [
    "",
    "NEGATIVE CONSTRAINT INSTRUCTION:",
    `Under no circumstances are you allowed to generate keywords, topics, or outlines semantically similar to: [${list}].`,
    "These terms have been explicitly rejected by the client. Skip them and focus on alternate, high-value topical directions.",
  ].join("\n");
}

/**
 * Build the Research Agent system prompt. Pulls the site's exclusion
 * list at call time and snapshots it into the returned text — the
 * worker should also receive the same list in payload.exclusions so it
 * can re-confirm before each LLM call.
 */
export async function buildResearchPrompt(
  siteId: number,
  opts: ResearchPromptOptions,
): Promise<{ prompt: string; exclusions: string[] }> {
  const rows = await listExclusions(siteId).catch(() => []);
  const exclusions = rows.map((r) => r.phrase);
  const ctx: string[] = [];
  if (opts.goal) ctx.push(`Project goal: ${opts.goal}`);
  if (opts.locale) ctx.push(`Locale: ${opts.locale}`);
  if (opts.seedTerms.length) {
    ctx.push(`Seed terms: ${opts.seedTerms.join(", ")}`);
  }
  const prompt = [BASE_RESEARCH, "", ...ctx, negativeBlock(exclusions)]
    .filter(Boolean)
    .join("\n");
  return { prompt, exclusions };
}

export async function buildIdeationPrompt(
  siteId: number,
  opts: IdeationPromptOptions,
): Promise<{ prompt: string; exclusions: string[] }> {
  const rows = await listExclusions(siteId).catch(() => []);
  const exclusions = rows.map((r) => r.phrase);
  const ctx: string[] = [];
  if (opts.goal) ctx.push(`Project goal: ${opts.goal}`);
  if (opts.audience) ctx.push(`Audience: ${opts.audience}`);
  if (opts.keywords.length) {
    ctx.push(`Approved keywords: ${opts.keywords.join(", ")}`);
  }
  const prompt = [BASE_IDEATION, "", ...ctx, negativeBlock(exclusions)]
    .filter(Boolean)
    .join("\n");
  return { prompt, exclusions };
}

// Exposed for testing the injected block without hitting the DB.
export { negativeBlock as buildNegativeConstraintBlock };
export const BASE_RESEARCH_PROMPT = BASE_RESEARCH;
export const BASE_IDEATION_PROMPT = BASE_IDEATION;
