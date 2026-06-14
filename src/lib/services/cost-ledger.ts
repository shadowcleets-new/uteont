/**
 * Token + cost ledger aggregation. Pure, deterministic, side-effect free.
 *
 * Reads spend off heterogeneous agent result blobs, rolls entries up by agent
 * and by day with a grand total, and answers budget-cap questions. Every entry
 * point is defensive: unknown/garbage shapes degrade to zero, never throw.
 */

// #region Types
export interface SpendEntry {
  agentKey: string;
  day: string; // "YYYY-MM-DD"
  tokens: number;
  costUsd: number;
}

interface SpendBucket {
  tokens: number;
  costUsd: number;
}

export interface SpendAggregate {
  total: SpendBucket;
  byAgent: Record<string, SpendBucket>;
  byDay: Record<string, SpendBucket>;
}
// #endregion

// #region Helpers
/** Coerce to a finite, non-negative number; anything else => 0. */
function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
// #endregion

// #region Public API
/**
 * Defensively pull { tokens, costUsd } off an agent result blob.
 * Cost: prefers result.costUsd, falls back to result.cost.
 * Tokens: prefers result.tokens, falls back to result.usage.totalTokens.
 * Missing / malformed values resolve to 0. Never throws.
 */
export function extractCost(
  result: Record<string, unknown> | null | undefined,
): { tokens: number; costUsd: number } {
  if (!isRecord(result)) return { tokens: 0, costUsd: 0 };

  const costUsd =
    result.costUsd !== undefined
      ? safeNumber(result.costUsd)
      : safeNumber(result.cost);

  let tokens = 0;
  if (result.tokens !== undefined) {
    tokens = safeNumber(result.tokens);
  } else if (isRecord(result.usage)) {
    tokens = safeNumber(result.usage.totalTokens);
  }

  return { tokens, costUsd };
}

/** Roll spend entries up by agent and by day, plus a grand total. */
export function aggregateSpend(entries: SpendEntry[]): SpendAggregate {
  const agg: SpendAggregate = {
    total: { tokens: 0, costUsd: 0 },
    byAgent: {},
    byDay: {},
  };
  if (!Array.isArray(entries)) return agg;

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const agentKey = typeof entry.agentKey === "string" ? entry.agentKey : "";
    const day = typeof entry.day === "string" ? entry.day : "";
    if (!agentKey || !day) continue;

    const tokens = safeNumber(entry.tokens);
    const costUsd = safeNumber(entry.costUsd);

    addInto(agg.total, tokens, costUsd);
    addInto((agg.byAgent[agentKey] ??= { tokens: 0, costUsd: 0 }), tokens, costUsd);
    addInto((agg.byDay[day] ??= { tokens: 0, costUsd: 0 }), tokens, costUsd);
  }

  return agg;
}

/**
 * Budget-cap check. Null cap => unlimited (not exceeded, Infinity remaining).
 * Otherwise exceeded when spent >= cap; remaining clamped at 0.
 */
export function checkBudgetCap(
  spentUsd: number,
  capUsd: number | null,
): { exceeded: boolean; remaining: number } {
  if (capUsd == null) return { exceeded: false, remaining: Infinity };
  const spent = safeNumber(spentUsd);
  const cap = safeNumber(capUsd);
  return { exceeded: spent >= cap, remaining: Math.max(0, cap - spent) };
}
// #endregion

// #region Internal mutation helper
function addInto(bucket: SpendBucket, tokens: number, costUsd: number): void {
  bucket.tokens += tokens;
  bucket.costUsd += costUsd;
}
// #endregion
