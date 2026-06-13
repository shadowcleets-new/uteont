import { describe, it, expect } from "vitest";
import { detectReoptimizationCandidates } from "./reoptimization";

const page = (over: Partial<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>) => ({
  page: "https://site/x",
  clicks: 100,
  impressions: 1000,
  ctr: 0.1,
  position: 5,
  ...over,
});

describe("detectReoptimizationCandidates (LO-11)", () => {
  it("flags a striking-distance page (positions 5–20, high impressions, low CTR)", () => {
    const cands = detectReoptimizationCandidates([
      page({ page: "https://site/a", position: 12, impressions: 5000, ctr: 0.005, clicks: 25 }),
    ]);
    expect(cands).toHaveLength(1);
    expect(cands[0].reason).toBe("striking-distance");
  });

  it("flags a decayed page (clicks dropped sharply vs the prior window)", () => {
    const cands = detectReoptimizationCandidates(
      [page({ page: "https://site/b", clicks: 20, impressions: 900, position: 8 })],
      { "https://site/b": { clicks: 100, impressions: 1000, ctr: 0.1, position: 6, page: "https://site/b" } },
    );
    expect(cands.some((c) => c.page === "https://site/b" && c.reason === "decayed")).toBe(true);
  });

  it("does NOT flag a healthy top-ranked page", () => {
    const cands = detectReoptimizationCandidates([
      page({ page: "https://site/c", position: 1.5, impressions: 2000, ctr: 0.4, clicks: 800 }),
    ]);
    expect(cands).toHaveLength(0);
  });

  it("ignores pages with negligible impressions (no signal)", () => {
    const cands = detectReoptimizationCandidates([
      page({ page: "https://site/d", position: 14, impressions: 12, ctr: 0.0, clicks: 0 }),
    ]);
    expect(cands).toHaveLength(0);
  });

  it("sorts candidates by opportunity (impressions) descending and caps the count", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      page({ page: `https://site/p${i}`, position: 12, impressions: 1000 + i * 100, ctr: 0.005, clicks: 5 }),
    );
    const cands = detectReoptimizationCandidates(rows, undefined, 5);
    expect(cands).toHaveLength(5);
    expect(cands[0].impressions).toBeGreaterThanOrEqual(cands[1].impressions);
  });
});
