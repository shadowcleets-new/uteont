/**
 * TypeScript port of the Python SEO Optimization Agent.
 * Pure deterministic SEO lint for markdown articles.
 */

interface Issue {
  severity: "low" | "med" | "high";
  field: string;
  message: string;
}

export interface SeoResult {
  score: number;
  issues: Issue[];
  title: string;
  titleLength: number;
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  headingStructure: Array<{ level: number; text: string }>;
  keywordDensityPercent: Record<string, number>;
  suggestedMetaDescription: string;
  suggestedMetaDescriptionLength: number;
  suggestedSchemaJsonld: Record<string, unknown>;
  checkedAt: string;
}

export function optimize(opts: {
  article: string;
  targetKeyword?: string;
}): SeoResult {
  const title = extractTitle(opts.article);
  const headings = extractHeadings(opts.article);
  const bodyText = stripMarkdown(opts.article);
  const words = tokenize(bodyText);
  const sentences = splitSentences(bodyText);

  const issues: Issue[] = [];
  let score = 100;

  // Title
  const titleLen = title.length;
  if (!title) {
    issues.push({ severity: "high", field: "title", message: "No H1 title found" });
    score -= 20;
  } else if (titleLen < 30) {
    issues.push({ severity: "med", field: "title",
      message: `Title is short (${titleLen} chars). Aim for 50-60.` });
    score -= 5;
  } else if (titleLen > 60) {
    issues.push({ severity: "med", field: "title",
      message: `Title is long (${titleLen} chars). Aim for 50-60.` });
    score -= 5;
  }
  if (opts.targetKeyword && title && !title.toLowerCase().includes(opts.targetKeyword.toLowerCase())) {
    issues.push({ severity: "high", field: "title",
      message: `Target keyword '${opts.targetKeyword}' missing from title` });
    score -= 15;
  }

  // Heading hierarchy
  const hLevels = headings.map((h) => h.level);
  if (hLevels.length === 0 || hLevels[0] !== 1) {
    issues.push({ severity: "high", field: "headings",
      message: "Article should start with H1" });
    score -= 10;
  }
  for (let i = 1; i < hLevels.length; i++) {
    if (hLevels[i] - hLevels[i - 1] > 1) {
      issues.push({ severity: "low", field: "headings",
        message: `Heading jump from H${hLevels[i - 1]} to H${hLevels[i]}` });
      score -= 2;
    }
  }

  // Body
  const wordCount = words.length;
  const sentenceCount = sentences.length;
  const avgSentenceLen = sentenceCount ? wordCount / sentenceCount : 0;
  if (wordCount < 300) {
    issues.push({ severity: "high", field: "body",
      message: `Too short (${wordCount} words). Aim for 800+.` });
    score -= 15;
  } else if (wordCount < 800) {
    issues.push({ severity: "med", field: "body",
      message: `Short article (${wordCount} words). Aim for 800+.` });
    score -= 5;
  }
  if (avgSentenceLen > 25) {
    issues.push({ severity: "low", field: "readability",
      message: `Long sentences (avg ${avgSentenceLen.toFixed(1)} words). Aim for 15-20.` });
    score -= 3;
  }

  // Keyword density
  const densities: Record<string, number> = {};
  if (opts.targetKeyword && wordCount > 0) {
    const targetWords = opts.targetKeyword.toLowerCase().split(/\s+/);
    const lowerWords = words.map((w) => w.toLowerCase());
    let occurrences = 0;
    for (let i = 0; i <= lowerWords.length - targetWords.length; i++) {
      let match = true;
      for (let j = 0; j < targetWords.length; j++) {
        if (lowerWords[i + j] !== targetWords[j]) { match = false; break; }
      }
      if (match) occurrences += 1;
    }
    const density = occurrences / Math.max(1, wordCount);
    densities[opts.targetKeyword] = round3(density * 100);
    if (density < 0.005) {
      issues.push({ severity: "med", field: "keyword_density",
        message: `Low density for '${opts.targetKeyword}' (${(density * 100).toFixed(2)}%). Aim for 0.5-2%.` });
      score -= 8;
    } else if (density > 0.03) {
      issues.push({ severity: "med", field: "keyword_density",
        message: `High density (${(density * 100).toFixed(2)}%) — may be flagged as keyword stuffing.` });
      score -= 5;
    }
  }

  // Meta description
  let metaDesc = "";
  if (sentences.length > 0) {
    const first = sentences[0];
    metaDesc = first.length > 155 ? first.slice(0, 152) + "..." : first;
  }

  // Schema
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    wordCount,
    datePublished: new Date().toISOString(),
  };
  if (opts.targetKeyword) schema.keywords = opts.targetKeyword;

  return {
    score: Math.max(0, score),
    issues,
    title,
    titleLength: titleLen,
    wordCount,
    sentenceCount,
    avgSentenceLength: round1(avgSentenceLen),
    headingStructure: headings,
    keywordDensityPercent: densities,
    suggestedMetaDescription: metaDesc,
    suggestedMetaDescriptionLength: metaDesc.length,
    suggestedSchemaJsonld: schema,
    checkedAt: new Date().toISOString(),
  };
}

// --- helpers --------------------------------------------------------

function extractTitle(article: string): string {
  const m = article.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

function extractHeadings(article: string): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = [];
  const re = /^(#+)\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(article)) !== null) {
    out.push({ level: m[1].length, text: m[2].trim() });
  }
  return out;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`+([^`]+)`+/g, "$1")
    .replace(/\*+([^*]+)\*+/g, "$1")
    .replace(/_+([^_]+)_+/g, "$1");
}

function tokenize(text: string): string[] {
  return text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
}

function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
