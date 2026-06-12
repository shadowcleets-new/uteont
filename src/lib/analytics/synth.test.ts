import { describe, it, expect } from "vitest";
import { buildSeries, buildRankings } from "./synth";

const ANCHOR = { articleTotal: 12, publishedTotal: 5, recentRunCount: 40 };
const END = new Date("2026-06-01T00:00:00Z");

describe("buildSeries", () => {
  it("returns a point for each requested day", () => {
    expect(buildSeries(END, 7, ANCHOR)).toHaveLength(7);
    expect(buildSeries(END, 30, ANCHOR)).toHaveLength(30);
    expect(buildSeries(END, 90, ANCHOR)).toHaveLength(90);
  });

  it("produces strictly chronological day labels (oldest first)", () => {
    const s = buildSeries(END, 5, ANCHOR);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].day > s[i - 1].day).toBe(true);
    }
  });

  it("is deterministic for the same end-date + range + anchors", () => {
    const a = buildSeries(END, 14, ANCHOR);
    const b = buildSeries(END, 14, ANCHOR);
    expect(a).toEqual(b);
  });

  it("clamps clicks <= impressions and revenue >= 0", () => {
    const s = buildSeries(END, 30, ANCHOR);
    for (const p of s) {
      expect(p.clicks).toBeLessThanOrEqual(p.impressions);
      expect(p.revenue).toBeGreaterThanOrEqual(0);
      expect(p.publishedArticles).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("buildRankings", () => {
  it("returns the full keyword pool", () => {
    const r = buildRankings(42);
    expect(r.length).toBeGreaterThan(10);
  });

  it("assigns revenueImpact consistent with position bucket", () => {
    const r = buildRankings(7);
    for (const row of r) {
      if (row.position < 5) expect(row.revenueImpact).toBe("high");
      else if (row.position < 12) expect(row.revenueImpact).toBe("medium");
      else expect(row.revenueImpact).toBe("low");
    }
  });

  it("is deterministic given the same seed", () => {
    expect(buildRankings(123)).toEqual(buildRankings(123));
  });
});
