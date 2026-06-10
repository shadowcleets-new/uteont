/**
 * Synthetic analytics helpers (Milestone 8).
 *
 * Real GSC + GA4 ingestion is M9 territory. Until then, the Analytics
 * page renders deterministic plausible series anchored to actual DB
 * counts (article totals, recent run activity) so the charts feel
 * real and the empty-state isn't confusing. A small linear-congruential
 * RNG seeded by the day-index keeps values stable across re-renders of
 * the same time window.
 */

export interface SeriesPoint {
  day: string;       // YYYY-MM-DD
  impressions: number;
  clicks: number;
  revenue: number;   // synthetic, monetary units arbitrary
  publishedArticles: number;
}

export interface RankingRow {
  keyword: string;
  position: number;       // 1.0 .. 100.0
  ctr: number;            // 0.0 .. 1.0
  impressions: number;
  revenueImpact: "high" | "medium" | "low";
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function dateOffset(d: Date, deltaDays: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + deltaDays);
  return out;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface Anchors {
  articleTotal: number;
  publishedTotal: number;
  recentRunCount: number;
}

/**
 * Build a daily series of length `days`. The newest point is yesterday
 * (today's data isn't yet "tracked"). Numbers scale with real anchors
 * so a fresh project shows small numbers, not implausible giants.
 */
export function buildSeries(
  endingAt: Date,
  days: number,
  anchors: Anchors,
): SeriesPoint[] {
  const rnd = seededRandom(days * 7919 + Math.floor(endingAt.getTime() / 86_400_000));
  const out: SeriesPoint[] = [];
  const articlesPerDay = Math.max(0.2, anchors.publishedTotal / 30);

  for (let i = days - 1; i >= 0; i--) {
    const day = dateOffset(endingAt, -i);
    const t = (days - i) / days; // 0 → 1 across the window
    const trendBoost = 1 + t * 0.4;
    const impressions = Math.round(
      (40 + anchors.articleTotal * 3) * trendBoost * (0.6 + rnd() * 0.8),
    );
    const ctr = 0.018 + rnd() * 0.03;
    const clicks = Math.max(0, Math.round(impressions * ctr));
    const revenue = +(clicks * (0.12 + rnd() * 0.18)).toFixed(2);
    const publishedArticles = Math.max(
      0,
      Math.round(articlesPerDay * (0.4 + rnd() * 1.4)),
    );
    out.push({
      day: isoDay(day),
      impressions,
      clicks,
      revenue,
      publishedArticles,
    });
  }
  return out;
}

const KEYWORD_POOL = [
  "best electric bikes 2026",
  "sourdough starter not rising",
  "ai seo trends",
  "shopify checkout optimization",
  "claude api streaming",
  "react server components patterns",
  "vercel fluid compute",
  "neon postgres branching",
  "structured data for recipes",
  "drizzle migrations workflow",
  "next.js 16 caching",
  "tailwind v4 themes",
  "ga4 attribution model",
  "core web vitals lcp",
  "competitor backlink analysis",
];

export function buildRankings(seed: number): RankingRow[] {
  const rnd = seededRandom(seed);
  return KEYWORD_POOL.map((kw) => {
    const position = +(1 + rnd() * 60).toFixed(1);
    const impressions = Math.round(200 + rnd() * 4000);
    const ctr = +(0.005 + rnd() * 0.12).toFixed(3);
    const revenueImpact: RankingRow["revenueImpact"] =
      position < 5 ? "high" : position < 12 ? "medium" : "low";
    return { keyword: kw, position, ctr, impressions, revenueImpact };
  });
}

export type Range = 7 | 30 | 90;
export const RANGES: Range[] = [7, 30, 90];
