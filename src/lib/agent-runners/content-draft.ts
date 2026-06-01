/**
 * Content Draft Agent (inline, fn-runtime) — the generative half of the
 * pipeline, running on Vercel via the same Gemini client the Director uses
 * (no worker needed). Turns a topic (optionally fed by a Content Brief's
 * missing terms/topics + the site's voice) into a titled, meta-tagged markdown
 * draft with an outline.
 *
 * `buildDraftPrompt` + `normalizeDraft` are pure (testable); `runContentDraft`
 * adds the Gemini call and degrades gracefully when GEMINI_API_KEY is absent.
 */

export interface DraftRequest {
  topic: string;
  keyword?: string;
  missingTerms?: string[];
  missingTopics?: string[];
  recommendedWordCount?: number;
  voice?: string;
  bannedPhrases?: string[];
}

export interface Draft {
  title: string;
  metaTitle: string;
  metaDescription: string;
  outline: string[];
  markdown: string;
  wordCount: number;
}

export interface DraftResult {
  configured: boolean;
  note?: string;
  topic: string;
  draft?: Draft;
  generatedAt: string;
}

export function buildDraftPrompt(req: DraftRequest): string {
  const lines = [
    `Write an SEO-optimized article for the topic: "${req.topic}".`,
    req.keyword ? `Primary keyword to target naturally: "${req.keyword}".` : "",
    `Target length: ~${req.recommendedWordCount && req.recommendedWordCount > 0 ? req.recommendedWordCount : 1200} words.`,
    req.missingTerms?.length ? `Cover these terms competitors rank for: ${req.missingTerms.join(", ")}.` : "",
    req.missingTopics?.length ? `Include sections for these subtopics: ${req.missingTopics.join("; ")}.` : "",
    req.voice ? `Voice/tone: ${req.voice}.` : "",
    req.bannedPhrases?.length ? `Never use these phrases: ${req.bannedPhrases.join(", ")}.` : "",
    "",
    "Return ONLY JSON with keys:",
    '- title (string)',
    '- metaTitle (string, <= 60 chars)',
    '- metaDescription (string, <= 160 chars)',
    '- outline (array of H2/H3 section headings, in order)',
    '- draftMarkdown (the full article in markdown using ## and ### headings)',
  ];
  return lines.filter(Boolean).join("\n");
}

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

export function normalizeDraft(data: unknown): Draft {
  const d = (data ?? {}) as Record<string, unknown>;
  const markdown = asStr(d.draftMarkdown ?? d.markdown ?? d.draft ?? d.body);
  const outline = Array.isArray(d.outline) ? d.outline.map((x) => String(x)).filter(Boolean) : [];
  return {
    title: asStr(d.title) || "Untitled draft",
    metaTitle: asStr(d.metaTitle).slice(0, 70),
    metaDescription: asStr(d.metaDescription).slice(0, 200),
    outline,
    markdown,
    wordCount: markdown ? markdown.split(/\s+/).filter(Boolean).length : 0,
  };
}

export async function runContentDraft(req: DraftRequest): Promise<DraftResult> {
  const generatedAt = new Date().toISOString();
  if (!req.topic.trim()) {
    return { configured: false, topic: req.topic, note: "No topic to write about — pass a topic or set the site's niche.", generatedAt };
  }
  if (!process.env.GEMINI_API_KEY) {
    return {
      configured: false,
      topic: req.topic,
      note: "GEMINI_API_KEY is not set in the environment — add it in Vercel to enable inline drafting.",
      generatedAt,
    };
  }
  try {
    const { completeJson } = await import("@/lib/services/gemini");
    const { data } = await completeJson(buildDraftPrompt(req), {
      task: "content-draft",
      temperature: 0.7,
      maxOutputTokens: 4096,
    });
    return { configured: true, topic: req.topic, draft: normalizeDraft(data), generatedAt };
  } catch (e) {
    return {
      configured: false,
      topic: req.topic,
      note: e instanceof Error ? e.message : "draft generation failed",
      generatedAt,
    };
  }
}
