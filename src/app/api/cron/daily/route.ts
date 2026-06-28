import { NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, siteIntegrations, decisionRecords } from "@/lib/db/schema";
import { startRun, finishRun } from "@/lib/services/runs";
import { runPerformanceTracking, loadGscConfig } from "@/lib/agent-runners/performance-tracking";
import { snapshotAllActiveTargets } from "@/lib/services/target-snapshots";
import { notifySlackForSite } from "@/lib/services/slack-notify";
import { runReoptimizationScan } from "@/lib/services/reoptimization";
import { upsertMetrics, toDayString, type MetricPoint } from "@/lib/services/metrics-timeseries";
import { fetchGscPageQueryRows } from "@/lib/integrations/gsc";
import { detectCannibalization, dedupeFindingsAgainstRecorded } from "@/lib/services/cannibalization";
import { recordDecision } from "@/lib/services/decision-records";
import { getFlag } from "@/lib/services/flags";

/**
 * Daily cron — the once-a-day heartbeat.
 *   1. Pull Google Search Console for every site that has a gsc integration
 *      (records a performance-tracking run; no-op/degrade if unconfigured).
 *   2. Snapshot every active target so the trajectory accrues a point per day
 *      even when nobody opens the app.
 * Auth checked by middleware (CRON_SECRET, set automatically by Vercel for
 * crons declared in vercel.json).
 */
export async function GET() {
  let perfSites = 0;
  let perfPulled = 0;
  let reoptCandidates = 0;
  let metricsWritten = 0;
  let cannibalizationFindings = 0;

  // N-25 — kill switch. The intelligence engine (per-site GSC metrics + the
  // cannibalization scan below) only runs when its flag is on. Flag off →
  // skip the whole block (snapshots still run) and report it explicitly.
  const engineEnabled = await getFlag("intelligence_engine");

  if (engineEnabled) {
  try {
    const db = getDb();
    const rows = await db
      .select({ siteId: siteIntegrations.siteId })
      .from(siteIntegrations)
      .where(eq(siteIntegrations.kind, "gsc"));
    const siteIds = [...new Set(rows.map((r) => r.siteId))];
    perfSites = siteIds.length;
    for (const siteId of siteIds) {
      const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
      const run = await startRun({
        subjectKey: "agent.performance-tracking",
        category: "agent",
        action: "daily-pull",
        siteId,
      }).catch(() => null);
      const result = await runPerformanceTracking(siteId, site?.domain ?? "");
      if (run) {
        await finishRun({
          runId: run.id,
          status: "success",
          result: result as unknown as Record<string, unknown>,
        }).catch(() => null);
      }
      if (result.configured) {
        perfPulled++;
        await notifySlackForSite(
          siteId,
          `UTEONT daily — Search Console (28d): ${result.clicks ?? 0} clicks, ${result.impressions ?? 0} impressions.`,
        ).catch(() => {});
        // LO-11: closed-loop re-optimization — feed the fresh GSC numbers back
        // into the pipeline by flagging underperforming pages as recommendations.
        reoptCandidates += await runReoptimizationScan(siteId, site?.domain ?? "").catch(() => 0);

        // IP-10 / IP-11 — persist site-level GSC + GA4 metrics as a time series so
        // trend / decay math has memory. Idempotent on the day key (re-run = overwrite).
        try {
          const day = toDayString();
          const entityKey = site?.domain || String(siteId);
          const points: MetricPoint[] = [];
          const push = (metric: string, value?: number) => {
            if (typeof value === "number" && Number.isFinite(value)) {
              points.push({ siteId, entityType: "site", entityKey, metric, value, capturedOn: day });
            }
          };
          push("clicks", result.clicks);
          push("impressions", result.impressions);
          push("ctr", result.ctr);
          push("position", result.position);
          push("ga4_sessions", result.ga4Sessions);
          push("ga4_users", result.ga4Users);
          push("ga4_conversions", result.ga4Conversions);
          metricsWritten += await upsertMetrics(points);
        } catch (e) {
          console.warn("[cron.daily] metrics upsert failed:", e);
        }

        // IP-42 — keyword cannibalization scan: pull per-(page, query) GSC rows and
        // record a warning decision for each query split across 2+ of our pages.
        try {
          const cfg = await loadGscConfig(siteId, site?.domain ?? undefined);
          const pageQuery = cfg?.propertyUrl ? await fetchGscPageQueryRows(cfg) : null;
          if (pageQuery && pageQuery.length > 0) {
            const findings = detectCannibalization(
              pageQuery.map((r) => ({
                query: r.query,
                page: r.page,
                impressions: r.impressions,
                position: r.position,
              })),
            );

            // N-14 — idempotent on (siteId, query, day). No unique constraint
            // exists on decision_records, so guard with check-then-skip: read
            // the cannibalization decisions already written for this site today
            // and drop findings whose query is already recorded. A daily cron is
            // not concurrent, so this fully prevents duplicates on a re-fire.
            const startOfDay = new Date(`${toDayString()}T00:00:00.000Z`);
            const existing = await db
              .select({ inputs: decisionRecords.inputs })
              .from(decisionRecords)
              .where(
                and(
                  eq(decisionRecords.siteId, siteId),
                  eq(decisionRecords.subjectKey, "loop.cannibalization"),
                  gte(decisionRecords.createdAt, startOfDay),
                ),
              );
            const recordedQueries = existing
              .map((r) => r.inputs?.query)
              .filter((q): q is string => typeof q === "string");
            const fresh = dedupeFindingsAgainstRecorded(findings, recordedQueries);

            for (const f of fresh.slice(0, 25)) {
              await recordDecision({
                siteId,
                subjectKey: "loop.cannibalization",
                kind: "warning",
                title: `Cannibalization: “${f.query}” split across ${f.pages.length} pages`,
                rationale:
                  `${f.pages.length} of our pages compete for “${f.query}” ` +
                  `(${f.totalImpressions} impressions). Consolidate or differentiate them: ` +
                  f.pages.map((p) => `${p.page} (pos ${p.position})`).join(", ") + ".",
                confidence: 0.7,
                evidence: f.pages.map((p) => ({
                  label: p.page,
                  value: `pos ${p.position}, ${p.impressions} impressions`,
                })),
                inputs: { query: f.query },
              });
              cannibalizationFindings++;
            }
          }
        } catch (e) {
          console.warn("[cron.daily] cannibalization scan failed:", e);
        }
      }
    }
  } catch (e) {
    console.warn("[cron.daily] performance pull failed:", e);
  }
  } else {
    console.info("[cron.daily] intelligence_engine flag off — skipping metrics + cannibalization block");
  }

  let snapshots = 0;
  try {
    snapshots = await snapshotAllActiveTargets();
  } catch (e) {
    console.warn("[cron.daily] snapshot failed:", e);
  }

  return NextResponse.json({
    ok: true,
    engineDisabled: !engineEnabled,
    ...(engineEnabled ? {} : { message: "engine disabled by flag" }),
    performance: { sites: perfSites, pulled: perfPulled },
    reoptimization: { candidates: reoptCandidates },
    metrics: { written: metricsWritten },
    cannibalization: { findings: cannibalizationFindings },
    snapshots,
  });
}
