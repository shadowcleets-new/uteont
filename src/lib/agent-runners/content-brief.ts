/**
 * Content Brief Agent (inline, fn-runtime) — the credential-free realization of
 * the design's SEO reverse-engineering + information-gain logic (§5.3/§5.4).
 *
 * `semanticProfile` deconstructs a page into wordcount / heading outline / top
 * terms / entities. `coverageAnalysis` compares the target page against a corpus
 * of competitor pages (or best-practice baselines when none are given) to
 * produce a content brief: recommended length, missing terms + topics, an
 * information-gain read, and a coverage score (the closed-loop metric).
 *
 * All analysis is pure; `runContentBrief` adds the public-HTML fetch. No SERP
 * API / credentials — competitor URLs are supplied by the caller (e.g. the
 * Director), or it self-analyzes against baselines.
 */

import type { Severity, TechCheck } from "./technical-seo";

export interface Term {
  term: string;
  count: number;
}

export interface Heading {
  level: number;
  text: string;
}

export interface SemanticProfile {
  url: string;
  wordCount: number;
  headings: Heading[];
  outline: string[];
  terms: Term[];
  entities: string[];
}

export interface ContentBriefResult {
  url: string;
  mode: "baseline" | "competitive";
  score: number;
  wordCount: number;
  recommendedWordCount: number;
  competitorsAnalyzed: number;
  medianCompetitorWords: number;
  infoGain: number;
  missingTerms: string[];
  missingTopics: string[];
  outline: string[];
  topTerms: string[];
  entities: string[];
  checks: TechCheck[];
  issues: TechCheck[];
  fetched: { target: boolean; competitors: number };
  checkedAt: string;
}

const STOPWORDS = new Set(
  ("the a an and or but if then else of to in on at by for with from as is are was were be been being this that these " +
    "those it its their your our his her you we they he she them us not no yes do does did doing have has had can could " +
    "will would shall should may might must about into over under more most some any each all such only own same so than " +
    "too very just up down out off again further once here there when where why how what which who whom whose because " +
    "while also been get got make made like one two three new use used using how-to via per etc")
    .split(/\s+/),
);

const sevRank = (s: Severity): number => (s === "high" ? 3 : s === "med" ? 2 : 1);

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Insert a boundary at block-element ends so capitalized runs from separate
    // blocks (headings, paragraphs) don't merge into one giant pseudo-entity.
    .replace(/<\/(h[1-6]|p|li|div|section|article|header|footer|td|th|blockquote)>/gi, ". ")
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(html: string): Heading[] {
  const out: Heading[] = [];
  for (const m of html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) out.push({ level: Number(m[1]), text });
  }
  return out;
}

function topTerms(text: string, n = 30): Term[] {
  const tokens = text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
  const freq = new Map<string, number>();
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, n);
}

function extractEntities(text: string, n = 20): string[] {
  const freq = new Map<string, number>();
  for (const m of text.matchAll(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g)) {
    const phrase = m[1].trim();
    const first = phrase.split(/\s+/)[0].toLowerCase();
    if (STOPWORDS.has(first)) continue;
    freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
  }
  return [...freq.entries()]
    .filter(([phrase, count]) => {
      const words = phrase.split(/\s+/).length;
      return words <= 4 && (phrase.includes(" ") || count >= 2);
    })
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, n)
    .map(([phrase]) => phrase);
}

export function semanticProfile(html: string, url: string): SemanticProfile {
  const text = visibleText(html);
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const headings = extractHeadings(html);
  return {
    url,
    wordCount: words.length,
    headings,
    outline: headings.filter((h) => h.level >= 2).map((h) => h.text),
    terms: topTerms(text),
    entities: extractEntities(text),
  };
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/**
 * Compare the target profile to a corpus of competitor profiles (or baselines
 * when the corpus is empty) and produce the brief.
 */
export function coverageAnalysis(
  target: SemanticProfile,
  competitors: SemanticProfile[],
  targetOk = true,
): ContentBriefResult {
  const checks: TechCheck[] = [];
  const add = (id: string, label: string, passed: boolean, severity: Severity, weight: number, detail: string) =>
    checks.push({ id, label, passed, severity, weight, detail });

  const targetTermSet = new Set(target.terms.map((t) => t.term));
  const outlineText = target.outline.join(" • ").toLowerCase();
  const mode: ContentBriefResult["mode"] = competitors.length > 0 ? "competitive" : "baseline";

  let recommendedWordCount: number;
  let missingTerms: string[] = [];
  let missingTopics: string[] = [];
  let infoGain = 0;
  let medianCompetitorWords = 0;
  let score: number;

  if (mode === "competitive") {
    medianCompetitorWords = median(competitors.map((c) => c.wordCount));
    recommendedWordCount = Math.max(800, Math.round(medianCompetitorWords * 1.1));

    // Document frequency of each competitor term across the corpus.
    const df = new Map<string, number>();
    for (const c of competitors) {
      for (const t of new Set(c.terms.map((x) => x.term))) df.set(t, (df.get(t) ?? 0) + 1);
    }
    const threshold = Math.ceil(competitors.length / 2);
    const importantTerms = [...df.entries()].filter(([, n]) => n >= threshold).map(([t]) => t);
    missingTerms = importantTerms.filter((t) => !targetTermSet.has(t)).slice(0, 20);
    const covered = importantTerms.length - missingTerms.length;
    score = importantTerms.length > 0 ? Math.round((covered / importantTerms.length) * 100) : 60;

    // Topics (competitor h2/h3) the target doesn't cover.
    const compTopics = new Map<string, string>();
    for (const c of competitors) for (const h of c.outline) compTopics.set(h.toLowerCase(), h);
    missingTopics = [...compTopics.entries()]
      .filter(([low]) => !outlineText.includes(low.slice(0, 24)))
      .map(([, h]) => h)
      .slice(0, 10);

    // Information gain: target terms not present anywhere in the corpus.
    const corpusTerms = new Set<string>();
    for (const c of competitors) for (const t of c.terms) corpusTerms.add(t.term);
    const unique = target.terms.filter((t) => !corpusTerms.has(t.term)).length;
    infoGain = Math.min(100, unique * 5);

    add("length_vs_corpus", `Length ≥ corpus median (${medianCompetitorWords})`, target.wordCount >= medianCompetitorWords, "high", 0, `${target.wordCount} words`);
    add("term_coverage", "Covers the corpus's important terms", missingTerms.length === 0, "high", 0, `${covered}/${importantTerms.length} covered`);
    add("topic_coverage", "Covers competitor topics", missingTopics.length === 0, "med", 0, `${missingTopics.length} topics missing`);
    add("information_gain", "Adds unique information", infoGain >= 25, "med", 0, `${infoGain}/100`);
  } else {
    recommendedWordCount = Math.max(800, target.wordCount);
    const distinctTerms = target.terms.length;
    add("depth", "Substantial depth (≥ 800 words)", target.wordCount >= 800, "high", 3, `${target.wordCount} words`);
    add("structure", "Sectioned (≥ 3 H2/H3)", target.outline.length >= 3, "med", 2, `${target.outline.length} sections`);
    add("entities", "Rich entities (≥ 5)", target.entities.length >= 5, "med", 2, `${target.entities.length} entities`);
    add("term_diversity", "Topic breadth (≥ 25 terms)", distinctTerms >= 25, "low", 2, `${distinctTerms} distinct terms`);
    add("has_h1", "Has an H1", target.headings.some((h) => h.level === 1), "low", 1, target.headings.some((h) => h.level === 1) ? "ok" : "missing");
    const maxW = checks.reduce((s, c) => s + c.weight, 0);
    const gotW = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
    score = targetOk && maxW > 0 ? Math.round((gotW / maxW) * 100) : 0;
  }

  if (!targetOk) score = 0;
  const issues = checks.filter((c) => !c.passed).sort((a, b) => sevRank(b.severity) - sevRank(a.severity));

  return {
    url: target.url,
    mode,
    score,
    wordCount: target.wordCount,
    recommendedWordCount,
    competitorsAnalyzed: competitors.length,
    medianCompetitorWords,
    infoGain,
    missingTerms,
    missingTopics,
    outline: target.outline.slice(0, 20),
    topTerms: target.terms.slice(0, 15).map((t) => t.term),
    entities: target.entities,
    checks,
    issues,
    fetched: { target: targetOk, competitors: competitors.length },
    checkedAt: new Date().toISOString(),
  };
}

// --- I/O wrapper ---------------------------------------------------------

async function fetchText(url: string, timeoutMs = 8000): Promise<{ ok: boolean; text: string }> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "UTEONT-ContentBrief/1.0 (+https://uteont.vercel.app)" },
      redirect: "follow",
    });
    clearTimeout(to);
    if (!res.ok) return { ok: false, text: "" };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, text: "" };
  }
}

const norm = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export async function runContentBrief(rawUrl: string, competitors: string[] = []): Promise<ContentBriefResult> {
  const url = norm(rawUrl);
  const targetDoc = await fetchText(url);
  const target = semanticProfile(targetDoc.text, url);

  const compUrls = competitors.slice(0, 5).map(norm);
  const compDocs = await Promise.all(compUrls.map((u) => fetchText(u)));
  const compProfiles = compDocs
    .map((d, i) => ({ d, u: compUrls[i] }))
    .filter((x) => x.d.ok)
    .map((x) => semanticProfile(x.d.text, x.u));

  return coverageAnalysis(target, compProfiles, targetDoc.ok);
}
