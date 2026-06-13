/**
 * @file reoptimization.ts
 * @description LO-11 — closed-loop re-optimization. Once GSC data exists, the
 * loop should feed measured performance back into the pipeline: pages that are
 * underperforming get re-queued for a content refresh. This module is the
 * detection half — a pure, tested classifier over GSC per-page rows — plus a
 * thin enqueue helper the daily cron calls after the GSC pull.
 *
 * Two signals, deliberately conservative (no paid rank API needed):
 *   - "striking-distance": ranks 5–20 with real impressions but a weak CTR — a
 *     small lift in relevance/title could win the click; classic SEO quick win.
 *   - "decayed": clicks fell sharply versus the prior window — the page is
 *     slipping and likely needs a refresh.
 */

import type { GscPageRow } from "@/lib/integrations/gsc";

export type ReoptReason = "striking-distance" | "decayed";

export interface ReoptCandidate {
  page: string;
  reason: ReoptReason;
  impressions: number;
  position: number;
  ctr: number;
  note: string;
}

// Tunables — conservative so the loop never spams refreshes.
const MIN_IMPRESSIONS = 100; // below this there's no statistical signal
const STRIKING_MIN_POS = 5;
const STRIKING_MAX_POS = 20;
const WEAK_CTR = 0.02; // 2% — low for a page already getting impressions
const DECAY_DROP = 0.4; // ≥40% clicks lost vs the prior window
const DEFAULT_CAP = 10;

/**
 * Classify GSC per-page rows into re-optimization candidates. `prior` (optional)
 * maps page URL → the previous window's row, enabling decay detection. Pure.
 */
export function detectReoptimizationCandidates(
  current: GscPageRow[],
  prior?: Record<string, GscPageRow>,
  cap = DEFAULT_CAP,
): ReoptCandidate[] {
  const out: ReoptCandidate[] = [];

  for (const row of current) {
    if (row.impressions < MIN_IMPRESSIONS) continue;

    // Decay: a meaningful click drop vs the prior window.
    const before = prior?.[row.page];
    if (before && before.clicks > 0) {
      const drop = (before.clicks - row.clicks) / before.clicks;
      if (drop >= DECAY_DROP) {
        out.push({
          page: row.page,
          reason: "decayed",
          impressions: row.impressions,
          position: row.position,
          ctr: row.ctr,
          note: `clicks fell ${Math.round(drop * 100)}% (${before.clicks}→${row.clicks}) — refresh to recover`,
        });
        continue;
      }
    }

    // Striking distance: ranks 5–20, real impressions, weak CTR.
    if (row.position >= STRIKING_MIN_POS && row.position <= STRIKING_MAX_POS && row.ctr <= WEAK_CTR) {
      out.push({
        page: row.page,
        reason: "striking-distance",
        impressions: row.impressions,
        position: row.position,
        ctr: row.ctr,
        note: `pos ${row.position.toFixed(1)}, ${row.impressions} impressions at ${(row.ctr * 100).toFixed(1)}% CTR — a refresh could win the click`,
      });
    }
  }

  // Best opportunity first (most impressions), capped.
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, cap);
}

/**
 * Scan one site's GSC pages (current vs prior 28-day window), detect
 * re-optimization candidates, and record each as an explainable DecisionRecord
 * recommendation so it surfaces on /decisions for the operator/Director to act
 * on. Deliberately does NOT auto-dispatch content jobs — that keeps a human in
 * the loop and avoids a runaway refresh storm. Best-effort: returns the count,
 * 0 when GSC is unconfigured/unreachable. Called by the daily cron.
 */
export async function runReoptimizationScan(siteId: number, fallbackProperty?: string): Promise<number> {
  const { loadGscConfig } = await import("@/lib/agent-runners/performance-tracking");
  const { fetchGscTopPages, gscDateRange } = await import("@/lib/integrations/gsc");
  const { recordDecision } = await import("./decision-records");

  const cfg = await loadGscConfig(siteId, fallbackProperty).catch(() => null);
  if (!cfg) return 0;

  const now = Date.now();
  const current = await fetchGscTopPages(cfg, gscDateRange(now, 28)).catch(() => null);
  if (!current || current.length === 0) return 0;

  // Prior window: the 28 days before the current one (offset the range end).
  const priorRange = gscDateRange(now - 28 * 86_400_000, 28);
  const priorRows = (await fetchGscTopPages(cfg, priorRange).catch(() => null)) ?? [];
  const prior: Record<string, GscPageRow> = {};
  for (const r of priorRows) prior[r.page] = r;

  const candidates = detectReoptimizationCandidates(current, prior);
  for (const c of candidates) {
    await recordDecision({
      siteId,
      subjectKey: "loop.reoptimization",
      kind: "recommendation",
      title: `Re-optimize ${c.page}`,
      rationale: c.note,
      confidence: c.reason === "decayed" ? 0.7 : 0.5,
      evidence: [
        { label: "reason", value: c.reason },
        { label: "position", value: c.position.toFixed(1) },
        { label: "impressions", value: String(c.impressions) },
        { label: "ctr", value: `${(c.ctr * 100).toFixed(1)}%` },
      ],
      inputs: { page: c.page },
    }).catch(() => null);
  }
  return candidates.length;
}
