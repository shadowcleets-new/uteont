import { describe, it, expect } from "vitest";

import {
  computeCoverageGap,
  type CompetitorProfile,
} from "./information-gain";

/**
 * IP-04 information-gain coverage-gap engine. Pure functions over plain
 * data — no DB, no clock, no RNG — so these cases are fully deterministic.
 */

function profile(
  terms: string[],
  wordCount = 1000,
  entities?: string[],
): CompetitorProfile {
  return { terms, wordCount, ...(entities ? { entities } : {}) };
}

describe("computeCoverageGap — mustCover", () => {
  it("flags a term all competitors cover but we lack", () => {
    const competitors: CompetitorProfile[] = [
      profile(["schema markup", "alpha"]),
      profile(["schema markup", "beta"]),
      profile(["schema markup", "gamma"]),
    ];
    const gap = computeCoverageGap(new Set(["alpha"]), competitors);
    expect(gap.mustCover).toContain("schema markup");
    expect(gap.df["schema markup"]).toBe(3);
  });

  it("excludes a term we already cover (case-insensitive) from mustCover", () => {
    const competitors: CompetitorProfile[] = [
      profile(["schema markup", "alpha"]),
      profile(["schema markup", "beta"]),
      profile(["schema markup", "gamma"]),
    ];
    // We already cover it (different casing) -> not a gap for us.
    const gap = computeCoverageGap(new Set(["Schema Markup"]), competitors);
    expect(gap.mustCover).not.toContain("schema markup");
  });

  it("sorts mustCover alphabetically for stable output", () => {
    const competitors: CompetitorProfile[] = [
      profile(["zebra", "apple", "mango"]),
      profile(["zebra", "apple", "mango"]),
    ];
    const gap = computeCoverageGap(new Set(), competitors);
    expect(gap.mustCover).toEqual([...gap.mustCover].sort());
    expect(gap.mustCover).toEqual(["apple", "mango", "zebra"]);
  });
});

describe("computeCoverageGap — gain vs mustCover partition", () => {
  it("niche term covered by exactly one of many appears in gain, not mustCover", () => {
    // N=5: floor(0.3*5)=1 so df==1 is underCovered; ceil(0.6*5)=3 is mustCover threshold.
    const competitors: CompetitorProfile[] = [
      profile(["broad term", "niche term"]),
      profile(["broad term"]),
      profile(["broad term"]),
      profile(["broad term"]),
      profile(["filler"]),
    ];
    const gap = computeCoverageGap(new Set(), competitors);
    // niche term: df=1 -> gain candidate, not mustCover
    expect(gap.gain).toContain("niche term");
    expect(gap.mustCover).not.toContain("niche term");
    // broad term: df=4 (>= ceil(0.6*5)=3) -> mustCover, not gain
    expect(gap.mustCover).toContain("broad term");
    expect(gap.gain).not.toContain("broad term");
    expect(gap.df["niche term"]).toBe(1);
    expect(gap.df["broad term"]).toBe(4);
  });

  it("merges entities into the per-profile vocabulary for df", () => {
    const competitors: CompetitorProfile[] = [
      profile(["alpha"], 1000, ["google", "schema"]),
      profile(["alpha"], 1000, ["google"]),
    ];
    const gap = computeCoverageGap(new Set(), competitors);
    expect(gap.df["google"]).toBe(2);
    expect(gap.df["schema"]).toBe(1);
    expect(gap.df["alpha"]).toBe(2);
  });
});

describe("computeCoverageGap — empty competitors edge case", () => {
  it("returns an empty gap with targetWordCount 0", () => {
    const gap = computeCoverageGap(new Set(["anything"]), []);
    expect(gap.mustCover).toEqual([]);
    expect(gap.gain).toEqual([]);
    expect(gap.targetWordCount).toBe(0);
    expect(gap.df).toEqual({});
  });
});

describe("computeCoverageGap — targetWordCount", () => {
  it("is round(median(wordCounts) * 1.15)", () => {
    const competitors: CompetitorProfile[] = [
      profile(["a"], 1000),
      profile(["b"], 2000),
      profile(["c"], 3000),
    ];
    const gap = computeCoverageGap(new Set(), competitors);
    // median 2000 * 1.15 = 2300
    expect(gap.targetWordCount).toBe(2300);
  });

  it("averages the two middle wordCounts for an even count", () => {
    const competitors: CompetitorProfile[] = [
      profile(["a"], 1000),
      profile(["b"], 2000),
      profile(["c"], 3000),
      profile(["d"], 4000),
    ];
    const gap = computeCoverageGap(new Set(), competitors, {
      wordMargin: 1,
    });
    // median of [1000,2000,3000,4000] = (2000+3000)/2 = 2500
    expect(gap.targetWordCount).toBe(2500);
  });
});

describe("computeCoverageGap — gain ranking & gainK cap", () => {
  it("caps the gain list length at gainK", () => {
    // 6 distinct df==1 terms across N=10 competitors; floor(0.3*10)=3 keeps them all underCovered.
    const competitors: CompetitorProfile[] = [
      profile(["g1"]),
      profile(["g2"]),
      profile(["g3"]),
      profile(["g4"]),
      profile(["g5"]),
      profile(["g6"]),
      profile(["filler"]),
      profile(["filler"]),
      profile(["filler"]),
      profile(["filler"]),
    ];
    const gap = computeCoverageGap(new Set(), competitors, { gainK: 3 });
    expect(gap.gain.length).toBe(3);
  });

  it("ranks gain by idf*intentWeight descending, with a custom intentWeight boost", () => {
    // Two niche terms with identical df (=1, so identical idf). intentWeight
    // breaks the tie deterministically toward "boosted".
    const competitors: CompetitorProfile[] = [
      profile(["boosted", "plain"]),
      profile(["filler"]),
      profile(["filler"]),
      profile(["filler"]),
      profile(["filler"]),
    ];
    const gap = computeCoverageGap(new Set(), competitors, {
      gainK: 2,
      intentWeight: (t) => (t === "boosted" ? 10 : 1),
    });
    expect(gap.gain[0]).toBe("boosted");
    expect(gap.gain).toContain("plain");
  });

  it("breaks idf*intentWeight ties alphabetically", () => {
    // N=5 -> floor(0.3*5)=1 so df==1 terms are underCovered. Both niche terms
    // share df==1 (equal idf), default intentWeight=1 -> equal score -> alphabetical.
    const competitors: CompetitorProfile[] = [
      profile(["yankee", "alpha"]),
      profile(["filler"]),
      profile(["filler"]),
      profile(["filler"]),
      profile(["filler"]),
    ];
    const gap = computeCoverageGap(new Set(), competitors, { gainK: 2 });
    expect(gap.gain).toEqual(["alpha", "yankee"]);
  });
});
