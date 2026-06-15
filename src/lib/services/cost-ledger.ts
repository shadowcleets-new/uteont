/**
 * @file cost-ledger.ts
 * @description Token + cost ledger aggregation (IP-14). Pure aggregation math
 *              plus a monthly-cap guard. No DB, no I/O — the DB reader is wired
 *              separately by the integrator; this module is the pure math only.
 *
 * [TABLE OF CONTENTS]
 * 1. TYPES & INTERFACES
 * 2. AGGREGATION (aggregateCost)
 * 3. CAP GUARD (isOverCap)
 * 4. ROW EXTRACTION (extractCostRow)
 * 5. HELPER UTILITIES
 * 6. DB-BACKED READER (monthToDateCost / cap)
 */

import { gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runs, kvSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// #region 1. Types & Interfaces

/** A single normalized ledger line. `day` is an ISO calendar date "YYYY-MM-DD". */
export interface CostRow {
  agentKey: string;
  day: string;
  tokens: number;
  costUsd: number;
}

/** A summed bucket of usage. */
export interface CostTotals {
  tokens: number;
  costUsd: number;
}

/** Grand total plus per-agent and per-day rollups. */
export interface CostAggregate {
  total: CostTotals;
  byAgent: Record<string, CostTotals>;
  byDay: Record<string, CostTotals>;
}

// #endregion

// #region 2. Aggregation (aggregateCost)

/**
 * Sum tokens and costUsd grouped by agentKey and by day, plus a grand total.
 * Missing/NaN numbers count as 0. Output costUsd is rounded to 6 dp to avoid
 * float accumulation noise.
 */
export function aggregateCost(rows: CostRow[]): CostAggregate {
  const total: CostTotals = { tokens: 0, costUsd: 0 };
  const byAgent: Record<string, CostTotals> = {};
  const byDay: Record<string, CostTotals> = {};

  for (const row of rows ?? []) {
    const tokens = toNumber(row?.tokens);
    const costUsd = toNumber(row?.costUsd);
    const agentKey = row?.agentKey ?? "";
    const day = row?.day ?? "";

    total.tokens += tokens;
    total.costUsd += costUsd;
    add(byAgent, agentKey, tokens, costUsd);
    add(byDay, day, tokens, costUsd);
  }

  total.costUsd = round6(total.costUsd);
  roundBucket(byAgent);
  roundBucket(byDay);
  return { total, byAgent, byDay };
}

// #endregion

// #region 3. Cap Guard (isOverCap)

/**
 * Monthly-cap guard. No cap is configured when capUsd is null/undefined/<= 0,
 * in which case spend is never "over". Otherwise the cap is breached strictly
 * above it.
 */
export function isOverCap(
  totalCostUsd: number,
  capUsd: number | null | undefined,
): boolean {
  if (capUsd == null || !Number.isFinite(capUsd) || capUsd <= 0) return false;
  return toNumber(totalCostUsd) > capUsd;
}

// #endregion

// #region 4. Row Extraction (extractCostRow)

/**
 * Defensively normalize a run record into a CostRow. Cost is read from
 * result.cost.totalUsd OR result.costUsd OR result.usage.costUsd; tokens from
 * result.cost.tokens OR result.tokens OR result.usage.totalTokens. agentKey is
 * derived from subjectKey ("agent.<key>" -> "<key>", else the raw value). day is
 * the YYYY-MM-DD slice of startedAt. Returns null when startedAt is missing or
 * when there is no cost/token signal at all.
 */
export function extractCostRow(run: {
  result?: Record<string, unknown> | null;
  subjectKey?: string;
  startedAt?: string | Date | null;
}): CostRow | null {
  const day = toDay(run?.startedAt);
  if (!day) return null;

  const result = run?.result ?? null;
  const cost = pickNumber(result, [
    ["cost", "totalUsd"],
    ["costUsd"],
    ["usage", "costUsd"],
  ]);
  const tokens = pickNumber(result, [
    ["cost", "tokens"],
    ["tokens"],
    ["usage", "totalTokens"],
  ]);

  // No usable signal at all -> not a ledger row.
  if (cost === undefined && tokens === undefined) return null;

  return {
    agentKey: parseAgentKey(run?.subjectKey),
    day,
    tokens: tokens ?? 0,
    costUsd: cost ?? 0,
  };
}

// #endregion

// #region 5. Helper Utilities

/** Coerce anything to a finite number, defaulting NaN/missing/non-finite to 0. */
function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Round to 6 decimals to clamp floating-point accumulation noise. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Accumulate tokens/cost into a keyed bucket, creating the slot on demand. */
function add(
  bucket: Record<string, CostTotals>,
  key: string,
  tokens: number,
  costUsd: number,
): void {
  const slot = bucket[key] ?? (bucket[key] = { tokens: 0, costUsd: 0 });
  slot.tokens += tokens;
  slot.costUsd += costUsd;
}

/** Round every bucket's costUsd in place. */
function roundBucket(bucket: Record<string, CostTotals>): void {
  for (const slot of Object.values(bucket)) {
    slot.costUsd = round6(slot.costUsd);
  }
}

/** Strip the "agent." prefix from a subjectKey; fall back to the raw value. */
function parseAgentKey(subjectKey?: string): string {
  if (!subjectKey) return "";
  return subjectKey.startsWith("agent.")
    ? subjectKey.slice("agent.".length)
    : subjectKey;
}

/** YYYY-MM-DD slice from an ISO string or Date; null when unparseable. */
function toDay(startedAt?: string | Date | null): string | null {
  if (!startedAt) return null;
  const iso =
    startedAt instanceof Date ? startedAt.toISOString() : String(startedAt);
  const slice = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

/**
 * Try each dotted path against a blob and return the first finite number found.
 * Returns undefined when no path yields a usable number (distinct from a real 0).
 */
function pickNumber(
  blob: Record<string, unknown> | null,
  paths: string[][],
): number | undefined {
  if (!blob || typeof blob !== "object") return undefined;
  for (const path of paths) {
    let cur: unknown = blob;
    for (const key of path) {
      if (cur && typeof cur === "object" && key in (cur as object)) {
        cur = (cur as Record<string, unknown>)[key];
      } else {
        cur = undefined;
        break;
      }
    }
    const n = typeof cur === "number" ? cur : Number(cur);
    if (cur !== undefined && cur !== null && cur !== "" && Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

// #endregion

// #region 6. DB-backed reader (monthToDateCost / cap)

const CAP_KEY = "monthly_cost_cap_usd";

/**
 * Month-to-date spend aggregated from runs.result, defensively. Reads every run
 * started on/after the 1st of the current UTC month, extracts each ledger row,
 * and rolls them up by agent + day. Missing table → empty aggregate.
 */
export async function monthToDateCost(now: Date = new Date()): Promise<CostAggregate> {
  try {
    const db = getDb();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const rows = await db
      .select({ result: runs.result, subjectKey: runs.subjectKey, startedAt: runs.startedAt })
      .from(runs)
      .where(gte(runs.startedAt, monthStart))
      .limit(5000);
    const ledger = rows
      .map((r) => extractCostRow({ result: r.result, subjectKey: r.subjectKey, startedAt: r.startedAt }))
      .filter((r): r is CostRow => r !== null);
    return aggregateCost(ledger);
  } catch (e) {
    console.warn("monthToDateCost failed (runs table unavailable)", e);
    return aggregateCost([]);
  }
}

/** The configured monthly USD cap, or null when unset. Defensive. */
export async function getMonthlyCapUsd(): Promise<number | null> {
  try {
    const db = getDb();
    const [row] = await db.select().from(kvSettings).where(eq(kvSettings.key, CAP_KEY)).limit(1);
    const v = row?.value;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Whether month-to-date spend has breached the configured cap. Defensive. */
export async function isSpendOverCap(
  now: Date = new Date(),
): Promise<{ over: boolean; totalUsd: number; capUsd: number | null }> {
  const [agg, cap] = await Promise.all([monthToDateCost(now), getMonthlyCapUsd()]);
  return { over: isOverCap(agg.total.costUsd, cap), totalUsd: agg.total.costUsd, capUsd: cap };
}

// #endregion
