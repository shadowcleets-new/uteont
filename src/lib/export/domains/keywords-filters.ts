/**
 * @file keywords-filters.ts
 * @description Pure filter helpers for the keywords export (A-11): validate
 * from/to dates instead of letting `new Date(bad)` silently yield an
 * Invalid Date that surfaces as a confusing empty export.
 */

/**
 * Parse an export date filter. Returns undefined when absent; throws on a
 * malformed value so the API can answer 400 rather than silently emptying the
 * result set.
 */
export function parseExportDate(value: string | undefined | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date filter: ${value}`);
  }
  return d;
}
