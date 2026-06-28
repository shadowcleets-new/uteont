// #region Types
export interface PageQueryRow {
  query: string;
  page: string;
  impressions: number;
  position: number;
}

export interface Cannibalization {
  query: string;
  pages: Array<{ page: string; impressions: number; position: number }>;
  totalImpressions: number;
}
// #endregion

// #region Constants
/** Noise floor: rows with fewer impressions are ignored entirely. */
const IMPRESSIONS_FLOOR = 10;
// #endregion

// #region Core
/**
 * Detect keyword cannibalization: queries served by 2+ ranking pages.
 *
 * Pipeline:
 *  1. Drop rows below the impressions floor (noise).
 *  2. Group surviving rows by query.
 *  3. Keep only groups with >= 2 pages (true competition).
 *  4. Within each group, sort pages best-rank-first (ascending position).
 *  5. Sort groups by total impressions descending.
 *
 * Pure and deterministic — no clock, no I/O, no randomness.
 */
export function detectCannibalization(
  rows: PageQueryRow[],
): Cannibalization[] {
  // Defensive: tolerate a non-array or empty payload.
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // #region Group surviving rows by query
  const groups = new Map<string, PageQueryRow[]>();
  for (const row of rows) {
    if (!row || typeof row.impressions !== "number") continue;
    if (row.impressions < IMPRESSIONS_FLOOR) continue;
    const bucket = groups.get(row.query);
    if (bucket) bucket.push(row);
    else groups.set(row.query, [row]);
  }
  // #endregion

  // #region Emit competing groups
  const out: Cannibalization[] = [];
  for (const [query, bucket] of groups) {
    if (bucket.length < 2) continue;

    const pages = bucket
      .map((r) => ({
        page: r.page,
        impressions: r.impressions,
        position: r.position,
      }))
      // best rank first: lower position is a better SERP slot.
      .sort((a, b) => a.position - b.position);

    const totalImpressions = pages.reduce(
      (sum, p) => sum + p.impressions,
      0,
    );

    out.push({ query, pages, totalImpressions });
  }
  // #endregion

  // Biggest aggregate exposure first.
  out.sort((a, b) => b.totalImpressions - a.totalImpressions);
  return out;
}
// #endregion

// #region Idempotency
/**
 * N-14 — drop findings whose query already has a cannibalization decision
 * recorded for the same site+day, so a re-fired daily cron writes no duplicate
 * rows. Pure and deterministic: `alreadyRecordedQueries` is the set of query
 * strings already persisted today; any finding whose query is in it is skipped.
 */
export function dedupeFindingsAgainstRecorded(
  findings: Cannibalization[],
  alreadyRecordedQueries: Iterable<string>,
): Cannibalization[] {
  if (!Array.isArray(findings) || findings.length === 0) return [];
  const seen = new Set<string>(alreadyRecordedQueries);
  return findings.filter((f) => !seen.has(f.query));
}
// #endregion
