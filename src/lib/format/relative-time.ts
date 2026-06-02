/**
 * Compact human relative time ("5 minutes ago", "in 2 hours"). Pure — `nowMs`
 * is passed in so it is deterministic and testable, and so client components
 * can capture a single post-mount `now` to avoid SSR hydration mismatches.
 */
export function relativeTime(from: Date | string | number | null | undefined, nowMs: number): string {
  if (from === null || from === undefined) return "—";
  const t =
    from instanceof Date ? from.getTime() : typeof from === "number" ? from : Date.parse(from);
  if (Number.isNaN(t)) return "—";

  const diff = nowMs - t;
  const future = diff < 0;
  const sec = Math.round(Math.abs(diff) / 1000);

  const units: Array<[limit: number, secondsPer: number, name: string]> = [
    [45, 1, "second"],
    [60 * 45, 60, "minute"],
    [3600 * 22, 3600, "hour"],
    [86400 * 26, 86400, "day"],
    [86400 * 320, 86400 * 30, "month"],
    [Infinity, 86400 * 365, "year"],
  ];

  if (sec < 45) return future ? "in a few seconds" : "just now";

  for (const [limit, secondsPer, name] of units) {
    if (sec < limit) {
      const n = Math.max(1, Math.round(sec / secondsPer));
      const label = `${n} ${name}${n === 1 ? "" : "s"}`;
      return future ? `in ${label}` : `${label} ago`;
    }
  }
  return future ? "in the future" : "a long time ago";
}
