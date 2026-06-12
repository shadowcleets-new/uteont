import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { CompetitorsWorkspace } from "@/components/competitors-workspace";
import type { CompetitorRow } from "@/components/competitor-directory";
import type { SiteCrawlResult } from "@/lib/agent-runners/site-crawl";

export const dynamic = "force-dynamic";
export const metadata = { title: "Competitors — UTEONT" };

interface ScanResult {
  url?: string;
  crawl?: SiteCrawlResult;
}

function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

/**
 * The directory is derived from real competitor-scan runs (Site Crawl
 * agent results) — latest scan per domain wins.
 */
async function fetchDirectory(): Promise<CompetitorRow[]> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(runs)
      .where(and(eq(runs.subjectKey, "infra.competitor-scan"), eq(runs.status, "success")))
      .orderBy(desc(runs.id))
      .limit(200);

    const byDomain = new Map<string, CompetitorRow>();
    for (const run of rows) {
      const result = run.result as ScanResult | null;
      const crawl = result?.crawl;
      if (!result?.url || !crawl) continue;
      const domain = domainOf(result.url);
      if (byDomain.has(domain)) continue; // rows are newest-first
      byDomain.set(domain, {
        id: String(run.id),
        domain,
        score: Number(crawl.score ?? 0),
        keyIssues: (crawl.issues ?? []).map((i) => i.label).filter(Boolean).slice(0, 5),
        weakPages: [...(crawl.thin ?? []), ...(crawl.orphans ?? [])].slice(0, 5),
        lastScanned: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
      });
    }
    return [...byDomain.values()];
  } catch (e) {
    console.warn("[competitors.fetchDirectory] DB error:", e);
    return [];
  }
}

export default async function CompetitorsPage() {
  const competitors = await fetchDirectory();

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-1">
        Competitors
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Run on-demand competitor crawls and browse the audited directory.
        Scans use the Site Crawl agent (public HTML, no credentials) — each
        successful crawl lands in the Directory with its score, weak pages,
        and failing checks.
      </p>
      <CompetitorsWorkspace initialCompetitors={competitors} />
    </div>
  );
}
