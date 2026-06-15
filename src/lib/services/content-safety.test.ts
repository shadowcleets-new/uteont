import { describe, it, expect } from "vitest";

import {
  checkContentSafety,
  type SafetyInput,
} from "./content-safety";

describe("checkContentSafety — banned phrases", () => {
  it("flags a banned phrase (case-insensitive) as a hard 'block'", () => {
    const input: SafetyInput = {
      draft: "Our product is the BEST cure for everything you could imagine.",
      bannedPhrases: ["best cure"],
    };
    const result = checkContentSafety(input);
    expect(result.ok).toBe(false);
    expect(result.hardFail).toBe(true);
    const banned = result.violations.filter((v) => v.kind === "banned_phrase");
    expect(banned).toHaveLength(1);
    expect(banned[0].severity).toBe("block");
    expect(banned[0].detail.toLowerCase()).toContain("best cure");
  });

  it("emits one 'block' violation per distinct banned phrase present", () => {
    const result = checkContentSafety({
      draft: "Guaranteed results, risk free, today only.",
      bannedPhrases: ["guaranteed results", "risk free", "absent phrase"],
    });
    const banned = result.violations.filter((v) => v.kind === "banned_phrase");
    expect(banned).toHaveLength(2);
    expect(result.hardFail).toBe(true);
  });
});

describe("checkContentSafety — plagiarism", () => {
  it("hard-blocks a draft that copies a long verbatim run from a source", () => {
    // A long verbatim run drives the distinct-8-gram overlap well past 0.20.
    const passage =
      "the quick brown fox jumps over the lazy dog while the cat watches " +
      "from the window sill and the bird sings a song in the early morning light";
    const result = checkContentSafety({
      draft: passage,
      sources: [passage],
    });
    expect(result.maxOverlap).toBeGreaterThanOrEqual(0.2);
    const plag = result.violations.filter((v) => v.kind === "plagiarism");
    expect(plag).toHaveLength(1);
    expect(plag[0].severity).toBe("block");
    expect(result.hardFail).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("passes an original draft against an unrelated source", () => {
    const result = checkContentSafety({
      draft:
        "Independent thinkers craft prose from scratch, weaving fresh metaphors " +
        "and unexpected turns that no archive could ever have predicted beforehand.",
      sources: [
        "Quarterly logistics throughput climbed across every regional warehouse hub " +
          "as automated palletizers replaced manual loading crews on the night shift.",
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.hardFail).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.maxOverlap).toBeLessThan(0.08);
  });
});

describe("checkContentSafety — defensive edges", () => {
  it("passes cleanly with no sources and no banned phrases", () => {
    const result = checkContentSafety({
      draft: "A perfectly ordinary sentence with nothing to flag at all here.",
    });
    expect(result.ok).toBe(true);
    expect(result.hardFail).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.maxOverlap).toBe(0);
  });

  it("treats an empty draft as ok with zero overlap", () => {
    const result = checkContentSafety({
      draft: "",
      bannedPhrases: ["anything"],
      sources: ["some source text that does not matter"],
    });
    expect(result.ok).toBe(true);
    expect(result.hardFail).toBe(false);
    expect(result.maxOverlap).toBe(0);
  });

  it("skips plagiarism scoring when the draft has fewer than 8 words", () => {
    const result = checkContentSafety({
      draft: "too short to gram",
      sources: ["too short to gram"],
    });
    expect(result.maxOverlap).toBe(0);
    expect(result.violations.filter((v) => v.kind === "plagiarism")).toHaveLength(
      0,
    );
    expect(result.ok).toBe(true);
  });

  it("emits a 'warn' (not a block) for partial overlap in the 0.08–0.20 band", () => {
    // Build a draft of many distinct 8-grams where only a minority also appear
    // in the source — landing the overlap fraction inside the warn band.
    // shared (9 words) -> 2 distinct 8-grams; total distinct draft 8-grams = 20,
    // so the overlap fraction is 2/20 = 0.10, squarely in [0.08, 0.20).
    const shared = "alpha bravo charlie delta echo foxtrot golf hotel india";
    const original =
      "ruby sapphire topaz quartz onyx jasper amber coral pearl jade opal flint " +
      "garnet zircon beryl agate marble granite";
    const result = checkContentSafety({
      draft: `${shared} ${original}`,
      sources: [shared],
    });
    expect(result.maxOverlap).toBeGreaterThanOrEqual(0.08);
    expect(result.maxOverlap).toBeLessThan(0.2);
    const plag = result.violations.filter((v) => v.kind === "plagiarism");
    expect(plag).toHaveLength(1);
    expect(plag[0].severity).toBe("warn");
    expect(result.hardFail).toBe(false);
    expect(result.ok).toBe(false);
  });
});
