/**
 * Site Crawl / Internal-Linking Agent (inline, fn-runtime).
 *
 * Samples the site's own sitemap (falling back to homepage links), fetches each
 * page, and builds the internal link graph to surface structural SEO problems:
 * orphan pages (nothing links to them) and thin-linking pages (few outbound
 * internal links). Public HTML only — no credentials.
 *
 * `analyzeSiteStructure` is pure (testable); `runSiteCrawl` adds the crawl.
 */

import type { Severity, TechCheck } from "./technical-seo";

export interface CrawlPage {
  /** Normalized path key used for graph identity (e.g. "/", "/blog/post"). */
  key: string;
  /** Display URL. */
  url: string;
  /** Normalized internal link keys found on this page. */
  links: string[];
}

export interface SiteStructureInput {
  entryUrl: string;
  entryKey: string;
  pages: CrawlPage[];
  sitemapCount: number;
  fetched: { sitemap: boolean; pages: number };
}

export interface SiteCrawlResult {
  entryUrl: string;
  score: number;
  crawled: number;
  sitemapCount: number;
  orphanCount: number;
  thinCount: number;
  avgInbound: number;
  avgOutbound: number;
  orphans: string[];
  thin: string[];
  checks: TechCheck[];
  issues: TechCheck[];
  fetched: { sitemap: boolean; pages: number };
  checkedAt: string;
}

const MIN_OUTBOUND = 3;
const sevRank = (s: Severity): number => (s === "high" ? 3 : s === "med" ? 2 : 1);

export function analyzeSiteStructure(input: SiteStructureInput): SiteCrawlResult {
  const { entryUrl, entryKey, pages, sitemapCount, fetched } = input;
  const checks: TechCheck[] = [];
  const add = (id: string, label: string, passed: boolean, severity: Severity, weight: number, detail: string) =>
    checks.push({ id, label, passed, severity, weight, detail });

  const keys = new Set(pages.map((p) => p.key));
  const inbound = new Map<string, number>();
  for (const k of keys) inbound.set(k, 0);
  for (const p of pages) {
    const seen = new Set<string>();
    for (const l of p.links) {
      if (l === p.key || seen.has(l)) continue;
      seen.add(l);
      if (keys.has(l)) inbound.set(l, (inbound.get(l) ?? 0) + 1);
    }
  }
  const outboundCount = (p: CrawlPage) => new Set(p.links.filter((l) => l !== p.key)).size;

  const crawled = pages.length;
  const orphanPages = pages.filter((p) => p.key !== entryKey && (inbound.get(p.key) ?? 0) === 0);
  const thinPages = pages.filter((p) => outboundCount(p) < MIN_OUTBOUND);
  const totalInbound = [...inbound.values()].reduce((s, n) => s + n, 0);
  const totalOutbound = pages.reduce((s, p) => s + outboundCount(p), 0);
  const avgInbound = crawled ? totalInbound / crawled : 0;
  const avgOutbound = crawled ? totalOutbound / crawled : 0;
  const thinBudget = Math.ceil(crawled * 0.25);

  add("pages_crawled", "Crawled ≥ 3 pages", crawled >= 3, "med", 6, `${crawled} pages`);
  add("sitemap_present", "sitemap.xml present", fetched.sitemap, "med", 8, fetched.sitemap ? `${sitemapCount} URLs` : "Missing/empty");
  add("no_orphans", "No orphan pages", orphanPages.length === 0, "high", 14, `${orphanPages.length} orphan pages`);
  add("internal_linking", `Internal links ≥ ${MIN_OUTBOUND}/page`, avgOutbound >= MIN_OUTBOUND, "high", 12, `${avgOutbound.toFixed(1)} links/page avg`);
  add("few_thin_pages", "Few thin-linking pages", thinPages.length <= thinBudget, "med", 8, `${thinPages.length} thin pages`);
  add("interlinked", "Pages are interlinked", avgInbound >= 1, "med", 8, `${avgInbound.toFixed(1)} inbound avg`);

  let score = 0;
  if (fetched.pages > 0) {
    const maxWeight = checks.reduce((s, c) => s + c.weight, 0);
    const gotWeight = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
    score = Math.round((gotWeight / maxWeight) * 100);
  }
  const issues = checks.filter((c) => !c.passed).sort((a, b) => sevRank(b.severity) - sevRank(a.severity));

  return {
    entryUrl,
    score,
    crawled,
    sitemapCount,
    orphanCount: orphanPages.length,
    thinCount: thinPages.length,
    avgInbound: Math.round(avgInbound * 10) / 10,
    avgOutbound: Math.round(avgOutbound * 10) / 10,
    orphans: orphanPages.slice(0, 8).map((p) => p.url),
    thin: thinPages.slice(0, 8).map((p) => p.url),
    checks,
    issues,
    fetched,
    checkedAt: new Date().toISOString(),
  };
}

// --- I/O wrapper ---------------------------------------------------------

const MAX_PAGES = 10;

async function fetchText(url: string, timeoutMs = 8000): Promise<{ ok: boolean; text: string }> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "UTEONT-SiteCrawl/1.0 (+https://uteont.vercel.app)" },
      redirect: "follow",
    });
    clearTimeout(to);
    if (!res.ok) return { ok: false, text: "" };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, text: "" };
  }
}

/** Normalized path key for graph identity, or null if not same-site / invalid. */
function keyOf(href: string, pageUrl: string, host: string): string | null {
  try {
    const u = new URL(href, pageUrl);
    if (u.host.toLowerCase() !== host) return null;
    if (!/^https?:$/.test(u.protocol)) return null;
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return path === "" ? "/" : path;
  } catch {
    return null;
  }
}

function internalLinkKeys(html: string, pageUrl: string, host: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    const low = href.toLowerCase();
    if (low.startsWith("#") || low.startsWith("mailto:") || low.startsWith("tel:") || low.startsWith("javascript:")) continue;
    const key = keyOf(href, pageUrl, host);
    if (key) out.add(key);
  }
  return [...out];
}

function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

export async function runSiteCrawl(rawUrl: string): Promise<SiteCrawlResult> {
  const entryUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const entry = new URL(entryUrl);
  const host = entry.host.toLowerCase();
  const origin = entry.origin;
  const entryKey = entry.pathname.replace(/\/+$/, "").toLowerCase() || "/";

  // 1) Discover candidate URLs from the sitemap (resolving one level of index).
  const sm = await fetchText(`${origin}/sitemap.xml`);
  let locs = sitemapLocs(sm.text);
  let pageLocs = locs.filter((l) => !/\.xml(\?|$)/i.test(l));
  const subSitemaps = locs.filter((l) => /\.xml(\?|$)/i.test(l));
  if (pageLocs.length === 0 && subSitemaps.length > 0) {
    const sub = await fetchText(subSitemaps[0]);
    locs = sitemapLocs(sub.text);
    pageLocs = locs.filter((l) => !/\.xml(\?|$)/i.test(l));
  }
  const sitemapCount = pageLocs.length;

  // 2) Build the crawl set: always include the homepage, then sampled sitemap URLs.
  const candidates: string[] = [origin + "/"];
  for (const l of pageLocs) {
    if (candidates.length >= MAX_PAGES) break;
    try {
      const u = new URL(l);
      if (u.host.toLowerCase() === host && !candidates.includes(u.toString())) candidates.push(u.toString());
    } catch {
      /* skip malformed */
    }
  }

  // 3) Fetch homepage first; if the sitemap gave us nothing, fall back to its links.
  const homepage = await fetchText(origin + "/");
  if (candidates.length === 1 && homepage.ok) {
    for (const key of internalLinkKeys(homepage.text, origin + "/", host)) {
      if (candidates.length >= MAX_PAGES) break;
      const abs = origin + (key === "/" ? "/" : key);
      if (!candidates.includes(abs)) candidates.push(abs);
    }
  }

  // 4) Fetch all pages (homepage reused), extract internal links, build the graph.
  const rest = candidates.slice(1);
  const restPages = await Promise.all(rest.map((u) => fetchText(u)));
  const fetchedDocs = [{ url: origin + "/", doc: homepage }, ...rest.map((u, i) => ({ url: u, doc: restPages[i] }))];

  const pages: CrawlPage[] = [];
  let okCount = 0;
  for (const { url, doc } of fetchedDocs) {
    if (!doc.ok) continue;
    okCount++;
    const key = keyOf(url, url, host) ?? "/";
    pages.push({ key, url, links: internalLinkKeys(doc.text, url, host) });
  }

  return analyzeSiteStructure({
    entryUrl,
    entryKey,
    pages,
    sitemapCount,
    fetched: { sitemap: sm.ok && sitemapCount > 0, pages: okCount },
  });
}
