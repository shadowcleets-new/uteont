import { describe, it, expect } from "vitest";
import {
  buildSearchAnalyticsBodyByPageQuery,
  parsePageQueryRows,
} from "./gsc";

describe("GSC per-(page, query) (IP-42 feed)", () => {
  it("builds a body with the page+query dimensions", () => {
    const body = buildSearchAnalyticsBodyByPageQuery(
      { startDate: "2026-01-01", endDate: "2026-01-28" },
      500,
    );
    expect(body).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-01-28",
      dimensions: ["page", "query"],
      rowLimit: 500,
    });
  });

  it("parses well-formed page+query rows", () => {
    const out = parsePageQueryRows({
      rows: [
        { keys: ["/a", "seo tools"], clicks: 10, impressions: 800, ctr: 0.0125, position: 6 },
        { keys: ["/b", "seo tools"], clicks: 3, impressions: 500, ctr: 0.006, position: 9 },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      page: "/a",
      query: "seo tools",
      clicks: 10,
      impressions: 800,
      ctr: 0.0125,
      position: 6,
    });
  });

  it("drops malformed rows and tolerates an empty/garbage payload", () => {
    expect(parsePageQueryRows(null)).toEqual([]);
    expect(parsePageQueryRows({})).toEqual([]);
    const out = parsePageQueryRows({
      rows: [
        { keys: ["/only-one-key"], impressions: 100 }, // missing query dim
        { keys: ["/a", "kw"], impressions: 50, position: 4 },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].query).toBe("kw");
  });
});
