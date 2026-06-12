import { describe, it, expect } from "vitest";
import { selectTopKeywordIds } from "./keyword-approval";

describe("selectTopKeywordIds (A-05 fix)", () => {
  it("approves the BEST-ranked keywords (priorityRank 1 = best), not the worst", () => {
    const rows = [
      { id: 10, priorityRank: 5 },
      { id: 11, priorityRank: 1 },
      { id: 12, priorityRank: 3 },
      { id: 13, priorityRank: 2 },
      { id: 14, priorityRank: 4 },
    ];
    // Top 2 by rank ascending = ranks 1 and 2 = ids 11 and 13.
    expect(selectTopKeywordIds(rows, 2)).toEqual([11, 13]);
  });

  it("clamps n above 50 down to 50", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, priorityRank: i + 1 }));
    expect(selectTopKeywordIds(rows, 999)).toHaveLength(50);
  });

  it("clamps n below 1 up to 1 (a zero/negative n is a fat-finger, not 'approve none')", () => {
    const rows = [
      { id: 1, priorityRank: 2 },
      { id: 2, priorityRank: 1 },
    ];
    expect(selectTopKeywordIds(rows, 0)).toEqual([2]);
    expect(selectTopKeywordIds(rows, -3)).toEqual([2]);
  });

  it("returns at most the number of rows available", () => {
    const rows = [{ id: 1, priorityRank: 1 }];
    expect(selectTopKeywordIds(rows, 5)).toEqual([1]);
  });

  it("returns an empty list when there are no rows", () => {
    expect(selectTopKeywordIds([], 5)).toEqual([]);
  });
});
