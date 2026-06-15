import { describe, it, expect } from "vitest";
import {
  aggregateCost,
  isOverCap,
  extractCostRow,
  type CostRow,
} from "./cost-ledger";

describe("aggregateCost", () => {
  it("groups two agents across two days with per-agent, per-day, and grand totals", () => {
    const rows: CostRow[] = [
      { agentKey: "content-draft", day: "2026-06-01", tokens: 100, costUsd: 0.1 },
      { agentKey: "content-draft", day: "2026-06-02", tokens: 200, costUsd: 0.2 },
      { agentKey: "keyword-scout", day: "2026-06-01", tokens: 50, costUsd: 0.05 },
      { agentKey: "keyword-scout", day: "2026-06-02", tokens: 70, costUsd: 0.07 },
    ];

    const agg = aggregateCost(rows);

    // grand total
    expect(agg.total.tokens).toBe(420);
    expect(agg.total.costUsd).toBeCloseTo(0.42, 6);

    // per-agent
    expect(agg.byAgent["content-draft"]).toEqual({ tokens: 300, costUsd: 0.3 });
    expect(agg.byAgent["keyword-scout"]).toEqual({ tokens: 120, costUsd: 0.12 });

    // per-day
    expect(agg.byDay["2026-06-01"]).toEqual({ tokens: 150, costUsd: 0.15 });
    expect(agg.byDay["2026-06-02"]).toEqual({ tokens: 270, costUsd: 0.27 });
  });

  it("treats missing/NaN numbers as 0", () => {
    const rows = [
      { agentKey: "a", day: "2026-06-01", tokens: NaN, costUsd: 0.5 },
      // deliberately malformed: tokens/costUsd missing
      { agentKey: "a", day: "2026-06-01" } as unknown as CostRow,
      { agentKey: "b", day: "2026-06-01", tokens: 10, costUsd: NaN },
    ];

    const agg = aggregateCost(rows);

    expect(agg.total.tokens).toBe(10);
    expect(agg.total.costUsd).toBeCloseTo(0.5, 6);
    expect(agg.byAgent["a"]).toEqual({ tokens: 0, costUsd: 0.5 });
    expect(agg.byAgent["b"]).toEqual({ tokens: 10, costUsd: 0 });
  });
});

describe("isOverCap", () => {
  it("returns false when no cap is configured (null)", () => {
    expect(isOverCap(12, null)).toBe(false);
  });

  it("returns true when total exceeds a positive cap", () => {
    expect(isOverCap(12, 10)).toBe(true);
  });

  it("returns false when total is under a positive cap", () => {
    expect(isOverCap(8, 10)).toBe(false);
  });

  it("returns false when cap is 0 (treated as no cap)", () => {
    expect(isOverCap(8, 0)).toBe(false);
  });
});

describe("extractCostRow", () => {
  it("pulls cost+tokens from result.cost and parses subjectKey + startedAt", () => {
    const row = extractCostRow({
      result: { cost: { totalUsd: 0.42, tokens: 1234 } },
      subjectKey: "agent.content-draft",
      startedAt: "2026-06-14T09:30:00.000Z",
    });

    expect(row).toEqual({
      agentKey: "content-draft",
      day: "2026-06-14",
      tokens: 1234,
      costUsd: 0.42,
    });
  });

  it("returns null when the result blob has no cost/token signal", () => {
    expect(
      extractCostRow({
        result: { foo: "bar" },
        subjectKey: "agent.content-draft",
        startedAt: "2026-06-14T09:30:00.000Z",
      }),
    ).toBeNull();
  });
});
