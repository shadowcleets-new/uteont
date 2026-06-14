import { describe, it, expect } from "vitest";
import {
  extractCost,
  aggregateSpend,
  checkBudgetCap,
  type SpendEntry,
} from "./cost-ledger";

describe("extractCost", () => {
  it("reads { costUsd, tokens } directly", () => {
    expect(extractCost({ costUsd: 1.25, tokens: 4200 })).toEqual({
      tokens: 4200,
      costUsd: 1.25,
    });
  });

  it("reads { cost } and { usage: { totalTokens } } fallbacks", () => {
    expect(extractCost({ cost: 0.5, usage: { totalTokens: 999 } })).toEqual({
      tokens: 999,
      costUsd: 0.5,
    });
  });

  it("prefers costUsd over cost and tokens over usage.totalTokens", () => {
    expect(
      extractCost({ costUsd: 2, cost: 9, tokens: 10, usage: { totalTokens: 99 } }),
    ).toEqual({ tokens: 10, costUsd: 2 });
  });

  it("returns zeros for null / undefined / garbage without throwing", () => {
    expect(extractCost(null)).toEqual({ tokens: 0, costUsd: 0 });
    expect(extractCost(undefined)).toEqual({ tokens: 0, costUsd: 0 });
    expect(extractCost({})).toEqual({ tokens: 0, costUsd: 0 });
    expect(
      extractCost({ costUsd: "nope", tokens: NaN, usage: "broken" }),
    ).toEqual({ tokens: 0, costUsd: 0 });
    expect(extractCost({ usage: null })).toEqual({ tokens: 0, costUsd: 0 });
    expect(extractCost({ costUsd: Infinity, tokens: -5 })).toEqual({
      tokens: 0,
      costUsd: 0,
    });
  });
});

describe("aggregateSpend", () => {
  it("groups by agent and by day and computes a grand total", () => {
    const entries: SpendEntry[] = [
      { agentKey: "writer", day: "2026-06-10", tokens: 100, costUsd: 1 },
      { agentKey: "writer", day: "2026-06-11", tokens: 200, costUsd: 2 },
      { agentKey: "editor", day: "2026-06-10", tokens: 50, costUsd: 0.5 },
    ];
    const agg = aggregateSpend(entries);

    expect(agg.total).toEqual({ tokens: 350, costUsd: 3.5 });
    expect(agg.byAgent).toEqual({
      writer: { tokens: 300, costUsd: 3 },
      editor: { tokens: 50, costUsd: 0.5 },
    });
    expect(agg.byDay).toEqual({
      "2026-06-10": { tokens: 150, costUsd: 1.5 },
      "2026-06-11": { tokens: 200, costUsd: 2 },
    });
  });

  it("returns empty buckets and zero total for no entries", () => {
    const agg = aggregateSpend([]);
    expect(agg.total).toEqual({ tokens: 0, costUsd: 0 });
    expect(agg.byAgent).toEqual({});
    expect(agg.byDay).toEqual({});
  });

  it("skips entries missing agentKey/day and coerces bad numeric fields to 0", () => {
    const dirty = [
      { agentKey: "a", day: "2026-06-10", tokens: 10, costUsd: 1 },
      null, // not a record -> skipped
      { agentKey: "", day: "2026-06-10", tokens: 5, costUsd: 1 }, // no agentKey -> skipped
      { agentKey: "a", day: "", tokens: 5, costUsd: 1 }, // no day -> skipped
      { agentKey: "a", day: "2026-06-10", tokens: "x", costUsd: 1 }, // bad tokens -> 0, cost kept
    ] as unknown as SpendEntry[];
    const agg = aggregateSpend(dirty);
    // first entry: 10 tokens / $1. last entry: tokens coerced to 0, costUsd $1 kept.
    expect(agg.total).toEqual({ tokens: 10, costUsd: 2 });
    expect(agg.byAgent).toEqual({ a: { tokens: 10, costUsd: 2 } });
  });
});

describe("checkBudgetCap", () => {
  it("returns Infinity remaining and not exceeded when cap is null", () => {
    expect(checkBudgetCap(9999, null)).toEqual({
      exceeded: false,
      remaining: Infinity,
    });
  });

  it("treats spent === cap as exceeded (>= boundary)", () => {
    expect(checkBudgetCap(100, 100)).toEqual({ exceeded: true, remaining: 0 });
  });

  it("computes remaining when under cap", () => {
    expect(checkBudgetCap(40, 100)).toEqual({ exceeded: false, remaining: 60 });
  });

  it("clamps remaining at 0 when over cap", () => {
    expect(checkBudgetCap(150, 100)).toEqual({ exceeded: true, remaining: 0 });
  });
});
