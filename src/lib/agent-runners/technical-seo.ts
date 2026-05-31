/**
 * #3 Technical SEO Agent (inline, fn-runtime).
 *
 * Self-contained: fetches the site's OWN public homepage + robots.txt +
 * sitemap.xml and runs a deterministic technical-SEO audit. No external
 * credentials required — it only reads public URLs, so it runs end-to-end
 * today regardless of integration setup.
 *
 * `analyzeTechnicalSeo` is pure (testable); `runTechnicalSeo` adds the fetch.
 */

export type Severity = "low" | "med" | "high";

export interface TechCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: Severity;
  weight: number;
  detail: string;
}

export interface TechnicalSeoResult {
  url: string;
  score: number;
  passed: number;
  total: number;
  checks: TechCheck[];
  issues: TechCheck[];
  fetched: { homepage: boolean; robotsTxt: boolean; sitemapXml: boolean };
  checkedAt: string;
}

export interface AnalysisInput {
  url: string;
  html: string;
  robotsTxt: string;
  sitemapXml: string;
  homepageOk: boolean;
}

function parseMetas(html: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  const tagRe = /<meta\b[^>]*>/gi;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(html)) !== null) {
    const attrs: Record<string, string> = {};
    const aRe = /([a-zA-Z:_-]+)\s*=\s*["']([^"']*)["']/g;
    let a: RegExpExecArray | null;
    while ((a = aRe.exec(t[0])) !== null) attrs[a[1].toLowerCase()] = a[2];
    out.push(attrs);
  }
  return out;
}

const sevRank = (s: Severity): number => (s === "high" ? 3 : s === "med" ? 2 : 1);

export function analyzeTechnicalSeo(input: AnalysisInput): TechnicalSeoResult {
  const { url, html, robotsTxt, sitemapXml, homepageOk } = input;
  const checks: TechCheck[] = [];
  const add = (id: string, label: string, passed: boolean, severity: Severity, weight: number, detail: string) =>
    checks.push({ id, label, passed, severity, weight, detail });

  const metas = parseMetas(html);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const desc = metas.find((m) => (m.name || "").toLowerCase() === "description")?.content ?? "";
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  const hasViewport = metas.some((m) => (m.name || "").toLowerCase() === "viewport");
  const lang = html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] ?? "";
  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  const ogTags = metas.filter((m) => (m.property || "").toLowerCase().startsWith("og:"));
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const imgsWithAlt = imgs.filter((i) => /\balt\s*=\s*["'][^"']*\S[^"']*["']/i.test(i)).length;
  const altCoverage = imgs.length === 0 ? 1 : imgsWithAlt / imgs.length;
  const isHttps = url.toLowerCase().startsWith("https://");
  const robotsHasSitemap = /^\s*sitemap\s*:/im.test(robotsTxt);
  const sitemapHasUrls = /<url\b|<sitemap\b/i.test(sitemapXml);

  add("https", "Served over HTTPS", isHttps, "high", 10, isHttps ? "ok" : "Site URL is not https");
  add("title", "Has a <title>", !!title, "high", 14, title ? `“${title.slice(0, 80)}”` : "Missing <title>");
  add("title_len", "Title length 30–60", title.length >= 30 && title.length <= 60, "low", 3, `${title.length} chars`);
  add("meta_desc", "Has meta description", !!desc, "high", 12, desc ? `${desc.length} chars` : "Missing");
  add("meta_desc_len", "Meta description 120–160", desc.length >= 120 && desc.length <= 160, "low", 3, `${desc.length} chars`);
  add("viewport", "Mobile viewport meta", hasViewport, "high", 10, hasViewport ? "ok" : "Missing viewport meta");
  add("lang", "html lang attribute", !!lang, "med", 5, lang || "Missing");
  add("single_h1", "Exactly one <h1>", h1Count === 1, "med", 8, `${h1Count} found`);
  add("canonical", "Canonical link", hasCanonical, "med", 8, hasCanonical ? "ok" : "No canonical link");
  add("jsonld", "Structured data (JSON-LD)", hasJsonLd, "med", 8, hasJsonLd ? "ok" : "None found");
  add("og", "Open Graph tags", ogTags.length > 0, "low", 4, `${ogTags.length} og:* tags`);
  add("img_alt", "Image alt coverage ≥ 80%", altCoverage >= 0.8, "low", 5, `${Math.round(altCoverage * 100)}% of ${imgs.length} imgs`);
  add("robots", "robots.txt present", robotsTxt.trim().length > 0, "med", 8, robotsTxt.trim() ? "ok" : "Missing/empty");
  add("robots_sitemap", "robots.txt references sitemap", robotsHasSitemap, "low", 3, robotsHasSitemap ? "ok" : "No Sitemap: line");
  add("sitemap", "sitemap.xml present", sitemapHasUrls, "med", 8, sitemapHasUrls ? "ok" : "Missing/empty");

  const total = checks.length;
  const passed = checks.filter((c) => c.passed).length;
  let score = 0;
  if (homepageOk) {
    const maxWeight = checks.reduce((s, c) => s + c.weight, 0);
    const gotWeight = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
    score = Math.round((gotWeight / maxWeight) * 100);
  }
  const issues = checks
    .filter((c) => !c.passed)
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity));

  return {
    url,
    score,
    passed,
    total,
    checks,
    issues,
    fetched: {
      homepage: homepageOk,
      robotsTxt: robotsTxt.trim().length > 0,
      sitemapXml: sitemapHasUrls,
    },
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
      headers: { "User-Agent": "UTEONT-TechnicalSEO/1.0 (+https://uteont.vercel.app)" },
      redirect: "follow",
    });
    clearTimeout(to);
    if (!res.ok) return { ok: false, text: "" };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, text: "" };
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

export async function runTechnicalSeo(rawUrl: string): Promise<TechnicalSeoResult> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const origin = originOf(url);
  const [home, robots, sitemap] = await Promise.all([
    fetchText(url),
    fetchText(`${origin}/robots.txt`),
    fetchText(`${origin}/sitemap.xml`),
  ]);
  return analyzeTechnicalSeo({
    url,
    html: home.text,
    robotsTxt: robots.text,
    sitemapXml: sitemap.text,
    homepageOk: home.ok,
  });
}
