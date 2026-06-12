/**
 * @file keyword-approval.ts
 * @description Pure selection logic behind the Telegram "Approve top N" button.
 *
 * Fixes audit A-05: the old inline version ordered by priorityRank DESC then
 * re-sorted ASC, so it approved the WORST-ranked keywords; n was unclamped.
 * priorityRank 1 = best, so the top-n are the n lowest ranks, clamped to a
 * sane [1, 50] batch.
 */

export interface RankedKeyword {
  id: number;
  priorityRank: number;
}

export const MAX_APPROVE_BATCH = 50;

/** Clamp n into [1, 50] — a zero/negative n is a fat-finger, not "approve none". */
export function clampApproveCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_APPROVE_BATCH, Math.floor(n)));
}

/**
 * Return the ids of the top-n keywords by priorityRank ascending (1 = best).
 * Pure: caller is responsible for scoping rows to the right run/status.
 */
export function selectTopKeywordIds(rows: RankedKeyword[], n: number): number[] {
  const count = clampApproveCount(n);
  return [...rows]
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .slice(0, count)
    .map((r) => r.id);
}
