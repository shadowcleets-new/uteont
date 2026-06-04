/**
 * Pure decision for the Director's rolling-summary memory: given how many
 * messages are currently sent verbatim (`liveCount`), decide whether to fold the
 * oldest ones into the running summary and how many to evict so exactly
 * `keepRecent` remain in the window. Keeps per-turn token cost flat.
 */

export interface CompactionPlan {
  shouldCompact: boolean;
  evictCount: number;
}

export function planCompaction(opts: {
  liveCount: number;
  keepRecent?: number;
  compactAt?: number;
}): CompactionPlan {
  const keepRecent = opts.keepRecent ?? 12;
  const compactAt = opts.compactAt ?? 24;
  if (opts.liveCount >= compactAt) {
    return { shouldCompact: true, evictCount: Math.max(0, opts.liveCount - keepRecent) };
  }
  return { shouldCompact: false, evictCount: 0 };
}
