import { describe, it, expect } from "vitest";

import { detectCannibalization, type PageQueryRow } from "./cannibalization";

describe("detectCannibalization", () => {
  it("flags a query where 2+ pages both rank with real impressions", () => {
    const rows: PageQueryRow[] = [
      { query: "seo tools", page: "/a", impressions: 800, position: 6 },
      { query: "seo tools", page: "/b", impressions: 500, position: 9 },
      { query: "link building", page: "/c", impressions: 300, position: 4 },
    ];

    const result = detectCannibalization(rows);

    expect(result).toHaveLength(1);
    expect(result[0].query).toBe("seo tools");
    expect(result[0].pages.map((p) => p.page)).toEqual(["/a", "/b"]);
    expect(result[0].totalImpressions).toBe(1300);
  });

  it("ignores a query served by a single page", () => {
    const rows: PageQueryRow[] = [
      { query: "single page query", page: "/only", impressions: 500, position: 3 },
    ];

    expect(detectCannibalization(rows)).toHaveLength(0);
  });

  it("ignores pages below the impressions floor", () => {
    const rows: PageQueryRow[] = [
      { query: "low traffic", page: "/a", impressions: 5, position: 3 },
      { query: "low traffic", page: "/b", impressions: 4, position: 7 },
    ];

    expect(detectCannibalization(rows)).toHaveLength(0);
  });

  it("sorts competing pages best-rank-first", () => {
    const rows: PageQueryRow[] = [
      { query: "rank sort", page: "/worse", impressions: 200, position: 9 },
      { query: "rank sort", page: "/better", impressions: 150, position: 3 },
    ];

    const result = detectCannibalization(rows);

    expect(result).toHaveLength(1);
    expect(result[0].pages[0].page).toBe("/better");
    expect(result[0].pages[0].position).toBe(3);
    expect(result[0].pages[1].page).toBe("/worse");
  });
});
