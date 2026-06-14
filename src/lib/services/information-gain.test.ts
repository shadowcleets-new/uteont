import { describe, it, expect } from "vitest";
import {
  computeCoverageGap,
  type CompetitorProfile,
} from "./information-gain";

// #region Fixtures
const prof = (
  terms: string[],
  wordCount: number,
  entities?: string[],
): CompetitorProfile => ({ terms, wordCount, ...(entities ? { entities } : {}) });
// #endregion

describe("computeCoverageGap — mustCover", () => {
  it("surfaces a term every competitor covers that we lack", () => {
    // N=4, coverFrac default 0.6 => threshold ceil(0.6*4)=3.
    // "schema markup" appears in all 4 profiles, we don't cover it.
    const profiles: CompetitorProfile[] = [
      prof(["schema markup", "alpha"], 1000),
      prof(["schema markup", "beta"], 1000),
      prof(["schema markup", "gamma"], 1000),
      prof(["schema markup", "delta"], 1000),
    ];
    const gap = computeCoverageGap(["alpha"], profiles);
    expect(gap.mustCover).toContain("schema markup");
  });

  it("excludes a near-universal term we already cover (case-insensitively)", () => {
    const profiles: CompetitorProfile[] = [
      prof(["Core Web Vitals", "x"], 800),
      prof(["core web vitals", "y"], 800),
      prof(["CORE WEB VITALS", "z"], 800),
      prof(["core web vitals", "w"], 800),
    ];
    // We cover it with different casing/whitespace; must be normalized out.
    const gap = computeCoverageGap(["  CORE web vitals "], profiles);
    expect(gap.mustCover).not.toContain("core web vitals");
  });

  it("sorts mustCover by df desc then alphabetical", () => {
    // N=4, threshold=3.
    // "aaa": df 4, "zzz": df 4, "mmm": df 3. We cover none.
    const profiles: CompetitorProfile[] = [
      prof(["aaa", "zzz", "mmm"], 500),
      prof(["aaa", "zzz", "mmm"], 500),
      prof(["aaa", "zzz", "mmm"], 500),
      prof(["aaa", "zzz"], 500),
    ];
    const gap = computeCoverageGap([], profiles);
    // df: aaa=4, zzz=4, mmm=3 -> [aaa, zzz] (df 4, alpha) then mmm (df 3)
    expect(gap.mustCover).toEqual(["aaa", "zzz", "mmm"]);
  });
});

describe("computeCoverageGap — gain (underCov)", () => {
  it("places a partial-overlap niche term in gain, not mustCover", () => {
    // N=5 -> cover threshold ceil(0.6*5)=3, niche cap floor(0.3*5)=1.
    // "niche term" in exactly 1 profile => df=1, within [1,1].
    const profiles: CompetitorProfile[] = [
      prof(["niche term", "common"], 1000),
      prof(["common"], 1000),
      prof(["common"], 1000),
      prof(["common"], 1000),
      prof(["common"], 1000),
    ];
    const gap = computeCoverageGap([], profiles);
    expect(gap.gain).toContain("niche term");
    expect(gap.mustCover).not.toContain("niche term");
  });

  it("respects topK and orders gain by idf desc then alphabetical", () => {
    // N=10 -> niche cap floor(0.3*10)=3. cover threshold ceil(0.6*10)=6.
    // Build terms with controlled df in [1,3] so all qualify as underCov.
    // idf = log(10/(df+1)); smaller df => larger idf.
    // df=1: t1a, t1b (idf=log(10/2)=1.609)
    // df=2: t2  (idf=log(10/3)=1.204)
    // df=3: t3  (idf=log(10/4)=0.916)
    const profiles: CompetitorProfile[] = [];
    for (let i = 0; i < 10; i++) {
      const terms: string[] = [];
      if (i < 1) terms.push("t1a");
      if (i < 1) terms.push("t1b");
      if (i < 2) terms.push("t2");
      if (i < 3) terms.push("t3");
      profiles.push(prof(terms, 700));
    }
    // topK=2 should pick the two df=1 terms (highest idf), alpha-ordered.
    const gap = computeCoverageGap([], profiles, { topK: 2 });
    expect(gap.gain).toEqual(["t1a", "t1b"]);

    // Full ordering with a generous topK: df1 (alpha) then df2 then df3.
    const full = computeCoverageGap([], profiles, { topK: 10 });
    expect(full.gain).toEqual(["t1a", "t1b", "t2", "t3"]);
  });

  it("applies intentWeight when scoring gain", () => {
    // N=10 niche cap 3. Two df=1 terms: equal idf. Weight breaks the tie
    // so "boost" outranks "plain" despite alpha order placing plain first.
    const profiles: CompetitorProfile[] = [];
    for (let i = 0; i < 10; i++) {
      const terms: string[] = [];
      if (i < 1) terms.push("boost");
      if (i < 1) terms.push("plain");
      profiles.push(prof(terms, 700));
    }
    const gap = computeCoverageGap([], profiles, {
      topK: 1,
      intentWeight: (t) => (t === "boost" ? 5 : 1),
    });
    expect(gap.gain).toEqual(["boost"]);
  });
});

describe("computeCoverageGap — targetWordCount", () => {
  it("is round(median * margin) with default margin 1.15", () => {
    // wordCounts [100,200,300] => median 200 => round(200*1.15)=230.
    const profiles: CompetitorProfile[] = [
      prof(["a"], 100),
      prof(["b"], 300),
      prof(["c"], 200),
    ];
    const gap = computeCoverageGap([], profiles);
    expect(gap.targetWordCount).toBe(230);
  });

  it("averages the two middle values for an even count", () => {
    // [100,200,300,400] => median (200+300)/2=250 => round(250*1.15)=288.
    const profiles: CompetitorProfile[] = [
      prof(["a"], 100),
      prof(["b"], 200),
      prof(["c"], 300),
      prof(["d"], 400),
    ];
    const gap = computeCoverageGap([], profiles);
    expect(gap.targetWordCount).toBe(288); // 250*1.15=287.5 -> round 288
  });

  it("honors a custom margin", () => {
    const profiles: CompetitorProfile[] = [
      prof(["a"], 100),
      prof(["b"], 200),
      prof(["c"], 300),
    ];
    const gap = computeCoverageGap([], profiles, { margin: 2 });
    expect(gap.targetWordCount).toBe(400); // median 200 * 2
  });
});

describe("computeCoverageGap — edge cases", () => {
  it("returns an all-empty result for zero competitors", () => {
    expect(computeCoverageGap(["a", "b"], [])).toEqual({
      mustCover: [],
      gain: [],
      targetWordCount: 0,
    });
  });

  it("merges terms and entities into one deduped set per profile", () => {
    // N=2, cover threshold ceil(0.6*2)=2. "entity x" lives in entities on
    // both profiles -> df=2 -> qualifies for mustCover.
    const profiles: CompetitorProfile[] = [
      prof(["term a"], 600, ["Entity X"]),
      prof(["term b"], 600, ["entity x"]),
    ];
    const gap = computeCoverageGap([], profiles);
    expect(gap.mustCover).toContain("entity x");
  });

  it("does not double-count a term repeated within one profile", () => {
    // N=3, niche cap floor(0.3*3)=0 so nothing is underCov; cover
    // threshold ceil(0.6*3)=2. "dup" appears twice in one profile only
    // => df must be 1, below threshold, so not in mustCover.
    const profiles: CompetitorProfile[] = [
      prof(["dup", "dup", "dup"], 500),
      prof(["other"], 500),
      prof(["other"], 500),
    ];
    const gap = computeCoverageGap([], profiles);
    expect(gap.mustCover).not.toContain("dup");
    expect(gap.gain).toEqual([]); // niche cap is 0
  });

  it("tolerates empty/blank terms and ourTerms without crashing", () => {
    const profiles: CompetitorProfile[] = [
      prof(["", "  ", "real"], 400),
      prof(["real"], 400),
    ];
    const gap = computeCoverageGap(["", "  "], profiles);
    expect(gap.mustCover).toContain("real");
  });

  it("accepts a Set as ourTerms (Iterable contract)", () => {
    const profiles: CompetitorProfile[] = [
      prof(["x"], 300),
      prof(["x"], 300),
    ];
    const gap = computeCoverageGap(new Set(["x"]), profiles);
    expect(gap.mustCover).not.toContain("x"); // we already cover it
  });
});
