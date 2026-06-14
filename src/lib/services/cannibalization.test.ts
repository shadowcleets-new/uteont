import { describe, it, expect } from "vitest";

import {
  detectCannibalization,
  type PageQueryRow,
} from "./cannibalization";

describe("detectCannibalization", () => {
  it("flags a query where 2+ pages both rank with real impressions, excluding single-page queries", () => {
    const rows: PageQueryRow[] = [
      { query: "best crm", page: "/crm-a", impressions: 120, position: 4 },
      { query: "best crm", page: "/crm-b", impressions: 80, position: 9 },
      { query: "solo query", page: "/only", impressions: 500, position: 2 },
    ];

    const result = detectCannibalization(rows);

    expect(result).toHaveLength(1);
    expect(result[0].query).toBe("best crm");
    expect(result[0].pages.map((p) => p.page)).toEqual(["/crm-a", "/crm-b"]);
    expect(result[0].totalImpressions).toBe(200);
  });

  it("ignores a query served by a single page", () => {
    const rows: PageQueryRow[] = [
      { query: "single", page: "/one", impressions: 300, position: 1 },
    ];

    expect(detectCannibalization(rows)).toEqual([]);
  });

  it("ignores pages below the impressions floor (< 10)", () => {
    const rows: PageQueryRow[] = [
      { query: "noisy", page: "/real", impressions: 50, position: 5 },
      { query: "noisy", page: "/noise", impressions: 9, position: 3 },
    ];

    // Only one page survives the floor -> not a cannibalization.
    expect(detectCannibalization(rows)).toEqual([]);
  });

  it("sorts competing pages best-rank-first (ascending position)", () => {
    const rows: PageQueryRow[] = [
      { query: "shoes", page: "/worse", impressions: 40, position: 12 },
      { query: "shoes", page: "/best", impressions: 60, position: 2 },
      { query: "shoes", page: "/middle", impressions: 50, position: 7 },
    ];

    const result = detectCannibalization(rows);

    expect(result).toHaveLength(1);
    expect(result[0].pages.map((p) => p.page)).toEqual([
      "/best",
      "/middle",
      "/worse",
    ]);
    expect(result[0].pages.map((p) => p.position)).toEqual([2, 7, 12]);
  });

  it("sorts output by totalImpressions descending", () => {
    const rows: PageQueryRow[] = [
      { query: "small", page: "/s1", impressions: 15, position: 5 },
      { query: "small", page: "/s2", impressions: 20, position: 8 },
      { query: "big", page: "/b1", impressions: 400, position: 3 },
      { query: "big", page: "/b2", impressions: 300, position: 6 },
    ];

    const result = detectCannibalization(rows);

    expect(result.map((c) => c.query)).toEqual(["big", "small"]);
    expect(result[0].totalImpressions).toBe(700);
    expect(result[1].totalImpressions).toBe(35);
  });
});
