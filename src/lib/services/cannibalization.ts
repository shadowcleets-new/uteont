/**
 * Keyword-cannibalization detector (IP-42).
 *
 * Pure, deterministic analysis over flat page/query rows (e.g. from Search
 * Console). It surfaces queries where two or more pages on the same site both
 * rank with meaningful impressions — a signal that pages are competing against
 * each other and diluting authority. No I/O, no clock, no randomness, so it's
 * fully unit-testable on the server or client.
 */

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

// #region Config

/** Per-page impression floor; below this a row is noise and is skipped. */
const MIN_IMPRESSIONS = 10;

// #endregion

// #region Core

/**
 * Detect cannibalizing queries.
 *
 * Drops rows under {@link MIN_IMPRESSIONS}, groups the survivors by query, and
 * keeps only queries served by >= 2 pages. Each survivor's pages are sorted by
 * position ascending (best rank first); results are sorted by totalImpressions
 * descending.
 */
export function detectCannibalization(rows: PageQueryRow[]): Cannibalization[] {
  const byQuery = new Map<string, PageQueryRow[]>();

  for (const row of rows) {
    if (row.impressions < MIN_IMPRESSIONS) continue;
    const bucket = byQuery.get(row.query);
    if (bucket) bucket.push(row);
    else byQuery.set(row.query, [row]);
  }

  const result: Cannibalization[] = [];

  for (const [query, pageRows] of byQuery) {
    if (pageRows.length < 2) continue;

    const pages = pageRows
      .map((r) => ({ page: r.page, impressions: r.impressions, position: r.position }))
      .sort((a, b) => a.position - b.position);

    const totalImpressions = pages.reduce((sum, p) => sum + p.impressions, 0);

    result.push({ query, pages, totalImpressions });
  }

  result.sort((a, b) => b.totalImpressions - a.totalImpressions);

  return result;
}

// #endregion
