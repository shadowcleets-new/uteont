import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { articles, runs } from "@/lib/db/schema";
import {
  buildRankings,
  buildSeries,
  RANGES,
  type Range,
} from "@/lib/analytics/synth";
import { AreaChart } from "@/components/analytics/AreaChart";
import { LineChart } from "@/components/analytics/LineChart";
import { RankingsTable } from "@/components/analytics/RankingsTable";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

async function fetchAnchors() {
  try {
    const db = getDb();
    const [a, p, r] = await Promise.all([
      db.select({ n: count() }).from(articles),
      db
        .select({ n: count() })
        .from(articles)
        .where(eq(articles.status, "published")),
      db.select({ n: count() }).from(runs),
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

function parseRange(raw: string | undefined): Range {
  const n = Number(raw);
  if (RANGES.includes(n as Range)) return n as Range;
  return 30;
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const anchors = await fetchAnchors();
  const end = new Date();
  const series = buildSeries(end, range, anchors);
  const labels = series.map((p) => p.day);
  const totals = series.reduce(
    (acc, p) => {
      acc.impressions += p.impressions;
      acc.clicks += p.clicks;
      acc.revenue += p.revenue;
      return acc;
    },
    { impressions: 0, clicks: 0, revenue: 0 },
  );
  const ctr =
    totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const rankings = buildRankings(range);

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight">
          Analytics
        </h1>
        <nav
          aria-label="Time range"
          className="flex items-center gap-1 text-[11px]"
        >
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
        Search performance, rankings, and revenue trends. Numbers are
        modeled from published-article counts and recent run activity until
        the GSC + GA4 ingest lands.
      </p>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <KpiSummary label="IMPRESSIONS" value={totals.impressions.toLocaleString()} />
        <KpiSummary label="CLICKS" value={totals.clicks.toLocaleString()} />
        <KpiSummary
          label="CTR"
          value={`${(ctr * 100).toFixed(2)}%`}
          tone={ctr > 0.04 ? "ok" : "neutral"}
        />
        <KpiSummary
          label="REVENUE"
          value={`$${totals.revenue.toFixed(2)}`}
          tone="ok"
        />
      </section>

      <section
        aria-label="Impressions and clicks"
        className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 mb-6"
      >
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
            ORGANIC TRAFFIC
          </div>
          <div className="text-[11px] text-[#6b6a64] tabular-nums">
            {labels.length} days
          </div>
        </div>
        <AreaChart
          labels={labels}
          series={[
            {
              label: "Impressions",
              values: series.map((p) => p.impressions),
              stroke: "#6a9bcc",
              fill: "#6a9bcc33",
            },
            {
              label: "Clicks",
              values: series.map((p) => p.clicks),
              stroke: "#788c5d",
              fill: "#788c5d44",
            },
          ]}
        />
      </section>

      <section
        aria-label="Revenue vs articles published"
        className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 mb-6"
      >
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
            REVENUE × PUBLISHED ARTICLES
          </div>
          <div className="text-[11px] text-[#6b6a64] tabular-nums">
            {labels.length} days
          </div>
        </div>
        <LineChart
          labels={labels}
          series={[
            {
              label: "Revenue",
              values: series.map((p) => p.revenue),
              stroke: "#d97757",
              axis: "left",
            },
            {
              label: "Articles published",
              values: series.map((p) => p.publishedArticles),
              stroke: "#141413",
              axis: "right",
            },
          ]}
        />
      </section>

      <RankingsTable rows={rankings} />
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
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
        {label}
      </div>
      <div
        className="text-[22px] font-semibold mt-1 tabular-nums"
        style={{ color, fontFamily: "Poppins, Arial, sans-serif" }}
      >
        {value}
      </div>
    </div>
  );
}
