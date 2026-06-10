import Link from "next/link";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { articles, kvSettings, runs, sites } from "@/lib/db/schema";
import {
  buildRankings,
  buildSeries,
  RANGES,
  type Range,
  type RankingRow,
  type SeriesPoint,
} from "@/lib/analytics/synth";
import {
  fetchGscDailySeries,
  fetchGscSummary,
  fetchGscTopQueries,
  gscDateRange,
} from "@/lib/integrations/gsc";
import { loadGscConfig } from "@/lib/agent-runners/performance-tracking";
import { AreaChart } from "@/components/area-chart";
import { LineChart } from "@/components/line-chart";
import { RankingsTable } from "@/components/rankings-table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics — UTEONT" };

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

async function getActiveSiteIdServer(): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(kvSettings)
    .where(eq(kvSettings.key, "ui.activeSiteId"))
    .limit(1);
  return row ? (row.value as { id: number | null }).id : null;
}

async function fetchAnchors(siteId: number) {
  try {
    const db = getDb();
    const [a, p, r] = await Promise.all([
      db.select({ n: count() }).from(articles).where(eq(articles.siteId, siteId)),
      db
        .select({ n: count() })
        .from(articles)
        .where(and(eq(articles.siteId, siteId), eq(articles.status, "published"))),
      db.select({ n: count() }).from(runs).where(eq(runs.siteId, siteId)),
    ]);
    return {
      articleTotal: Number(a[0]?.n ?? 0),
      publishedTotal: Number(p[0]?.n ?? 0),
      recentRunCount: Number(r[0]?.n ?? 0),
    };
  } catch (e) {
    console.warn("[analytics.fetchAnchors] DB error:", e);
    return { articleTotal: 0, publishedTotal: 0, recentRunCount: 0 };
  }
}

/** Real articles-created-per-day buckets for the chart's right axis. */
async function fetchArticlesPerDay(
  siteId: number,
  days: string[],
): Promise<number[]> {
  if (days.length === 0) return [];
  try {
    const db = getDb();
    const since = new Date(`${days[0]}T00:00:00Z`);
    const rows = await db
      .select({ createdAt: articles.createdAt })
      .from(articles)
      .where(and(eq(articles.siteId, siteId), gte(articles.createdAt, since)));
    const byDay = new Map<string, number>(days.map((d) => [d, 0]));
    for (const r of rows) {
      const d = new Date(r.createdAt).toISOString().slice(0, 10);
      if (byDay.has(d)) byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    return days.map((d) => byDay.get(d) ?? 0);
  } catch {
    return days.map(() => 0);
  }
}

function parseRange(raw: string | undefined): Range {
  const n = Number(raw);
  if (RANGES.includes(n as Range)) return n as Range;
  return 30;
}

function impactFor(position: number): RankingRow["revenueImpact"] {
  return position < 5 ? "high" : position < 12 ? "medium" : "low";
}

interface AnalyticsData {
  mode: "live" | "modeled";
  series: Array<Pick<SeriesPoint, "day" | "impressions" | "clicks">>;
  totals: { impressions: number; clicks: number; ctr: number; position: number | null };
  rankings: RankingRow[];
  revenueSeries: number[] | null; // modeled only
}

/**
 * Live when the site has a working GSC connection; otherwise the modeled
 * series anchored to real DB counts (pensive's honest-demo behavior).
 */
async function loadAnalytics(siteId: number, range: Range): Promise<AnalyticsData> {
  let cfg = null;
  try {
    const db = getDb();
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    cfg = await loadGscConfig(siteId, site?.domain);
  } catch {
    cfg = null; // encryption key absent → modeled
  }

  if (cfg?.propertyUrl) {
    const window = gscDateRange(Date.now(), range);
    const [daily, summary, queries] = await Promise.all([
      fetchGscDailySeries(cfg, window),
      fetchGscSummary(cfg, window),
      fetchGscTopQueries(cfg, window, 50),
    ]);
    if (daily && daily.length > 0) {
      return {
        mode: "live",
        series: daily.map((p) => ({ day: p.day, impressions: p.impressions, clicks: p.clicks })),
        totals: {
          impressions: summary?.impressions ?? daily.reduce((s, p) => s + p.impressions, 0),
          clicks: summary?.clicks ?? daily.reduce((s, p) => s + p.clicks, 0),
          ctr: summary?.ctr ?? 0,
          position: summary?.position ?? null,
        },
        rankings: (queries ?? []).map((q) => ({
          keyword: q.query,
          position: Math.round(q.position * 10) / 10,
          ctr: q.ctr,
          impressions: Math.round(q.impressions),
          revenueImpact: impactFor(q.position),
        })),
        revenueSeries: null,
      };
    }
  }

  const anchors = await fetchAnchors(siteId);
  const series = buildSeries(new Date(), range, anchors);
  const impressions = series.reduce((s, p) => s + p.impressions, 0);
  const clicks = series.reduce((s, p) => s + p.clicks, 0);
  return {
    mode: "modeled",
    series,
    totals: {
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: null,
    },
    rankings: buildRankings(range),
    revenueSeries: series.map((p) => p.revenue),
  };
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const activeSiteId = await getActiveSiteIdServer().catch(() => null);

  if (!activeSiteId) {
    return (
      <div className="px-9 py-8 max-w-[1200px]">
        <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">Analytics</h1>
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            Select a site (top-left) to see its search performance.
          </p>
        </div>
      </div>
    );
  }

  const data = await loadAnalytics(activeSiteId, range);
  const labels = data.series.map((p) => p.day);
  const articlesPerDay = await fetchArticlesPerDay(activeSiteId, labels);

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight">
          Analytics
          <span
            className={cn(
              "ml-3 align-middle inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
              data.mode === "live"
                ? "bg-[#f0f4ec] text-[#788c5d] border border-[#788c5d]/40"
                : "bg-[#f3f1ea] text-[#6b6a64] border border-[#e8e6dc]",
            )}
          >
            {data.mode === "live" ? "Live · GSC" : "Modeled"}
          </span>
        </h1>
        <nav aria-label="Time range" className="flex items-center gap-1 text-[11px]">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/analytics?range=${r}`}
              className={cn(
                "rounded-full border px-2.5 py-1 transition-colors",
                r === range
                  ? "border-[#d97757] bg-[#fef3eb] text-[#a33b2b]"
                  : "border-[#e8e6dc] bg-white text-[#6b6a64] hover:border-[#cfccc1]",
              )}
            >
              Last {r} days
            </Link>
          ))}
        </nav>
      </div>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        {data.mode === "live"
          ? "Search Console performance for this site — daily impressions, clicks, and the live query rankings."
          : "Numbers are modeled from this site's article counts and run activity. Connect Google Search Console on the site's Integrations page to switch this view to live data."}
      </p>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <KpiSummary label="IMPRESSIONS" value={data.totals.impressions.toLocaleString()} />
        <KpiSummary label="CLICKS" value={data.totals.clicks.toLocaleString()} />
        <KpiSummary
          label="CTR"
          value={`${(data.totals.ctr * 100).toFixed(2)}%`}
          tone={data.totals.ctr > 0.04 ? "ok" : "neutral"}
        />
        {data.totals.position != null ? (
          <KpiSummary label="AVG POSITION" value={data.totals.position.toFixed(1)} tone="ok" />
        ) : (
          <KpiSummary
            label="REVENUE (MODELED)"
            value={`$${(data.revenueSeries ?? []).reduce((s, v) => s + v, 0).toFixed(2)}`}
            tone="ok"
          />
        )}
      </section>

      <section
        aria-label="Impressions and clicks"
        className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 mb-6"
      >
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">ORGANIC TRAFFIC</div>
          <div className="text-[11px] text-[#6b6a64] tabular-nums">{labels.length} days</div>
        </div>
        <AreaChart
          labels={labels}
          series={[
            {
              label: "Impressions",
              values: data.series.map((p) => p.impressions),
              stroke: "#6a9bcc",
              fill: "#6a9bcc33",
            },
            {
              label: "Clicks",
              values: data.series.map((p) => p.clicks),
              stroke: "#788c5d",
              fill: "#788c5d44",
            },
          ]}
        />
      </section>

      <section
        aria-label="Clicks vs articles"
        className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 mb-6"
      >
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
            {data.mode === "live" ? "CLICKS × ARTICLES CREATED" : "REVENUE (MODELED) × ARTICLES CREATED"}
          </div>
          <div className="text-[11px] text-[#6b6a64] tabular-nums">{labels.length} days</div>
        </div>
        <LineChart
          labels={labels}
          series={[
            data.mode === "live"
              ? {
                  label: "Clicks",
                  values: data.series.map((p) => p.clicks),
                  stroke: "#d97757",
                  axis: "left" as const,
                }
              : {
                  label: "Revenue (modeled)",
                  values: data.revenueSeries ?? [],
                  stroke: "#d97757",
                  axis: "left" as const,
                },
            {
              label: "Articles created",
              values: articlesPerDay,
              stroke: "#141413",
              axis: "right" as const,
            },
          ]}
        />
      </section>

      <RankingsTable rows={data.rankings} />
    </div>
  );
}

function KpiSummary({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ok" | "neutral";
}) {
  const color = tone === "ok" ? "#788c5d" : "#141413";
  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">{label}</div>
      <div
        className="text-[22px] font-semibold mt-1 tabular-nums"
        style={{ color, fontFamily: "Poppins, Arial, sans-serif" }}
      >
        {value}
      </div>
    </div>
  );
}
