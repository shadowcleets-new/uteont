/**
 * Content Audit Agent (inline, fn-runtime).
 *
 * Complements Technical SEO: where that agent audits infrastructure (HTTPS,
 * meta, sitemap), this one fetches the live page and scores the *content* —
 * depth, structure, internal linking, scannability, readability. Public HTML
 * only, so it runs end-to-end today with no credentials.
 *
 * `analyzeContentAudit` is pure (testable); `runContentAudit` adds the fetch.
 */

import type { Severity, TechCheck } from "./technical-seo";

export interface ContentCounts {
  h1: number;
  h2: number;
  h3: number;
  paragraphs: number;
  internalLinks: number;
  externalLinks: number;
  lists: number;
  tables: number;
  images: number;
  sentences: number;
}

export interface ContentAuditResult {
  url: string;
  score: number;
  wordCount: number;
  readability: string;
  avgWordsPerSentence: number;
  counts: ContentCounts;
  checks: TechCheck[];
  issues: TechCheck[];
  fetched: { page: boolean };
  checkedAt: string;
}

export interface ContentAnalysisInput {
  url: string;
  html: string;
  pageOk: boolean;
}

const sevRank = (s: Severity): number => (s === "high" ? 3 : s === "med" ? 2 : 1);

const countTags = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

/** Strip scripts/styles/tags to approximate the visible text. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Classify the page's anchors into internal vs external content links. */
function classifyLinks(html: string, pageUrl: string): { internal: number; external: number } {
  const pageHost = hostOf(pageUrl);
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].trim());
  let internal = 0;
  let external = 0;
  for (const href of hrefs) {
    const low = href.toLowerCase();
    if (low.startsWith("#") || low.startsWith("mailto:") || low.startsWith("tel:") || low.startsWith("javascript:")) {
      continue;
    }
    if (/^https?:\/\//i.test(href)) {
      const h = hostOf(href);
      if (h && pageHost && h === pageHost) internal++;
      else external++;
    } else {
      // Relative or protocol-relative-to-same-site link.
      internal++;
    }
  }
  return { internal, external };
}

function readabilityBand(avg: number): string {
  if (avg <= 14) return "Easy";
  if (avg <= 20) return "Moderate";
  if (avg <= 25) return "Fair";
  return "Hard";
}

export function analyzeContentAudit(input: ContentAnalysisInput): ContentAuditResult {
  const { url, html, pageOk } = input;
  const checks: TechCheck[] = [];
  const add = (id: string, label: string, passed: boolean, severity: Severity, weight: number, detail: string) =>
    checks.push({ id, label, passed, severity, weight, detail });

  const text = visibleText(html);
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const sentenceParts = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const sentences = sentenceParts.length;
  const avgWordsPerSentence = sentences > 0 ? wordCount / sentences : wordCount;

  const h1 = countTags(html, /<h1[\s>]/gi);
  const h2 = countTags(html, /<h2[\s>]/gi);
  const h3 = countTags(html, /<h3[\s>]/gi);
  const paragraphs = countTags(html, /<p[\s>]/gi);
  const lists = countTags(html, /<(ul|ol)[\s>]/gi);
  const tables = countTags(html, /<table[\s>]/gi);
  const images = countTags(html, /<img\b/gi);
  const { internal: internalLinks, external: externalLinks } = classifyLinks(html, url);

  add("content_depth", "Substantial content (≥ 600 words)", wordCount >= 600, "high", 14, `${wordCount} words`);
  add("single_h1", "Exactly one <h1>", h1 === 1, "high", 10, `${h1} found`);
  add("sections", "Sectioned with ≥ 2 <h2>", h2 >= 2, "med", 8, `${h2} h2 headings`);
  add("heading_order", "No skipped heading levels", h3 === 0 || h2 > 0, "low", 4, h3 > 0 && h2 === 0 ? "h3 without any h2" : "ok");
  add("internal_links", "Internal links ≥ 3", internalLinks >= 3, "high", 10, `${internalLinks} internal links`);
  add("outbound_context", "Cites external sources", externalLinks >= 1, "low", 3, `${externalLinks} external links`);
  add("scannable", "Scannable (a list or table)", lists + tables >= 1, "med", 6, `${lists} lists, ${tables} tables`);
  add("paragraphs", "Broken into paragraphs (≥ 3)", paragraphs >= 3, "med", 6, `${paragraphs} <p> blocks`);
  add("readability", "Readable sentences (≤ 25 words avg)", sentences > 0 && avgWordsPerSentence <= 25, "med", 8, `${avgWordsPerSentence.toFixed(1)} words/sentence`);
  add("media", "Has imagery", images >= 1, "low", 4, `${images} images`);

  let score = 0;
  if (pageOk) {
    const maxWeight = checks.reduce((s, c) => s + c.weight, 0);
    const gotWeight = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
    score = Math.round((gotWeight / maxWeight) * 100);
  }
  const issues = checks.filter((c) => !c.passed).sort((a, b) => sevRank(b.severity) - sevRank(a.severity));

  return {
    url,
    score,
    wordCount,
    readability: readabilityBand(avgWordsPerSentence),
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    counts: { h1, h2, h3, paragraphs, internalLinks, externalLinks, lists, tables, images, sentences },
    checks,
    issues,
    fetched: { page: pageOk },
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
      headers: { "User-Agent": "UTEONT-ContentAudit/1.0 (+https://uteont.vercel.app)" },
      redirect: "follow",
    });
    clearTimeout(to);
    if (!res.ok) return { ok: false, text: "" };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, text: "" };
  }
}

export async function runContentAudit(rawUrl: string): Promise<ContentAuditResult> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const page = await fetchText(url);
  return analyzeContentAudit({ url, html: page.text, pageOk: page.ok });
}
