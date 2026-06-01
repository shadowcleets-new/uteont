/**
 * Revenue Optimization Agent (inline, fn-runtime).
 *
 * Credential-free conversion audit of the live page: are there clear CTAs, a
 * path to a money page (pricing/contact/checkout), lead capture, and trust
 * signals? Reads only public HTML. Complements the SEO audits with the
 * "does this page try to convert?" lens. Scores → `revenue_score` metric.
 *
 * `analyzeRevenue` is pure (testable); `runRevenue` adds the fetch.
 */

import type { Severity, TechCheck } from "./technical-seo";

export interface RevenueCounts {
  ctas: number;
  moneyLinks: number;
  forms: number;
  trustSignals: number;
  externalLinks: number;
}

export interface RevenueResult {
  url: string;
  score: number;
  counts: RevenueCounts;
  checks: TechCheck[];
  issues: TechCheck[];
  fetched: { page: boolean };
  checkedAt: string;
}

const sevRank = (s: Severity): number => (s === "high" ? 3 : s === "med" ? 2 : 1);

const CTA_RE =
  /\b(buy|purchase|add\s+to\s+cart|checkout|order\s+now|sign\s?up|get\s+started|start\s+(free|now)|free\s+trial|try\s+(it\s+)?free|subscribe|contact\s+us|book\s+(a\s+)?(demo|call)|request\s+(a\s+)?(demo|quote)|get\s+a\s+quote|join|register|download)\b/i;

const MONEY_RE =
  /(pricing|\/price|contact|checkout|\/cart|\/buy|\/book|demo|\/quote|subscribe|sign[\s-]?up|register|\/order|\/shop|\/store|\/plans?)/i;

const TRUST_RE =
  /(testimonial|reviews?|rating|trusted\s+by|as\s+seen\s+in|case\s+stud|5[\s-]?star|★|customers?\s+love|money[\s-]?back|guarantee)/i;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return null;
  }
}

export function analyzeRevenue(input: { url: string; html: string; pageOk: boolean }): RevenueResult {
  const { url, html, pageOk } = input;
  const checks: TechCheck[] = [];
  const add = (id: string, label: string, passed: boolean, severity: Severity, weight: number, detail: string) =>
    checks.push({ id, label, passed, severity, weight, detail });

  const pageHost = hostOf(url);
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: (m[1].match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "").trim(),
    text: stripTags(m[2]),
  }));
  const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((m) => stripTags(m[1]));

  const ctas =
    anchors.filter((a) => CTA_RE.test(a.text)).length + buttons.filter((b) => CTA_RE.test(b)).length;
  const moneyLinks = anchors.filter((a) => MONEY_RE.test(a.href) || MONEY_RE.test(a.text)).length;
  const forms = (html.match(/<form\b/gi) ?? []).length;
  const emailInputs = (html.match(/type\s*=\s*["']email["']/gi) ?? []).length;
  const text = stripTags(html);
  const trustSignals = (text.match(new RegExp(TRUST_RE, "gi")) ?? []).length;
  const externalLinks = anchors.filter((a) => {
    if (!/^https?:\/\//i.test(a.href)) return false;
    const h = hostOf(a.href);
    return h !== null && h !== pageHost;
  }).length;

  const aboveFoldCta = CTA_RE.test(stripTags(html.slice(0, 4000)));

  add("has_cta", "Has a call to action", ctas >= 1, "high", 14, `${ctas} CTA elements`);
  add("above_fold_cta", "CTA near the top of the page", aboveFoldCta, "med", 8, aboveFoldCta ? "ok" : "none in first ~4KB");
  add("money_page_link", "Links to a money page (pricing/contact/checkout)", moneyLinks >= 1, "high", 12, `${moneyLinks} conversion links`);
  add("lead_capture", "Lead capture (a form or email field)", forms >= 1 || emailInputs >= 1, "med", 8, `${forms} forms, ${emailInputs} email fields`);
  add("multiple_ctas", "Repeated CTAs (≥ 3)", ctas >= 3, "low", 5, `${ctas} CTAs`);
  add("trust_signals", "Trust signals (reviews/guarantee)", trustSignals >= 1, "low", 5, `${trustSignals} signals`);
  add("outbound_value", "Cites/links outward (partners/affiliates)", externalLinks >= 1, "low", 3, `${externalLinks} external links`);

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
    counts: { ctas, moneyLinks, forms, trustSignals, externalLinks },
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
      headers: { "User-Agent": "UTEONT-Revenue/1.0 (+https://uteont.vercel.app)" },
      redirect: "follow",
    });
    clearTimeout(to);
    if (!res.ok) return { ok: false, text: "" };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, text: "" };
  }
}

export async function runRevenue(rawUrl: string): Promise<RevenueResult> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const page = await fetchText(url);
  return analyzeRevenue({ url, html: page.text, pageOk: page.ok });
}
