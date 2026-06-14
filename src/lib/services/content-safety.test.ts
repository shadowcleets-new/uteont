import { describe, it, expect } from "vitest";
import { checkContentSafety } from "./content-safety";

describe("checkContentSafety — banned phrases", () => {
  it("flags a banned phrase present in the draft (case-insensitive)", () => {
    const report = checkContentSafety("Our GUARANTEED returns beat the market.", {
      bannedPhrases: ["guaranteed returns"],
    });
    expect(report.ok).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].kind).toBe("banned-phrase");
    expect(report.violations[0].detail).toContain("guaranteed returns");
  });

  it("passes when no banned phrase is present", () => {
    const report = checkContentSafety("A perfectly ordinary sentence about cats.", {
      bannedPhrases: ["guaranteed returns", "risk free"],
    });
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it("flags every distinct banned phrase that appears", () => {
    const report = checkContentSafety("Risk free and guaranteed returns today!", {
      bannedPhrases: ["risk free", "guaranteed returns"],
    });
    expect(report.violations).toHaveLength(2);
    expect(report.violations.every((v) => v.kind === "banned-phrase")).toBe(true);
  });
});

describe("checkContentSafety — plagiarism (n-gram overlap)", () => {
  const source =
    "the quick brown fox jumps over the lazy dog and then runs away quickly";

  it("flags a draft sharing an 8+ word verbatim run with a source", () => {
    const draft =
      "Yesterday the quick brown fox jumps over the lazy dog while we watched.";
    const report = checkContentSafety(draft, { sources: [source] });
    expect(report.ok).toBe(false);
    const plag = report.violations.find((v) => v.kind === "plagiarism");
    expect(plag).toBeDefined();
    expect(plag?.detail).toContain("quick brown fox jumps over the lazy dog");
  });

  it("passes when only short overlaps (< n-gram) exist", () => {
    // Shares "the quick brown fox" (4 words) only — below the 8-word window.
    const draft = "the quick brown fox sat calmly on a warm summer afternoon.";
    const report = checkContentSafety(draft, { sources: [source] });
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it("honors a custom, smaller ngram window", () => {
    const draft = "the quick brown fox sat calmly elsewhere.";
    const report = checkContentSafety(draft, { sources: [source], ngram: 4 });
    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.kind === "plagiarism")).toBe(true);
  });

  it("caps the plagiarism detail length", () => {
    const longRun = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const report = checkContentSafety(longRun, { sources: [longRun], ngram: 8 });
    const plag = report.violations.find((v) => v.kind === "plagiarism");
    expect(plag).toBeDefined();
    expect(plag!.detail.length).toBeLessThanOrEqual(220);
  });
});

describe("checkContentSafety — combined & ok flag", () => {
  it("ok=false whenever any violation exists", () => {
    const report = checkContentSafety("guaranteed returns the quick brown fox jumps over the lazy dog now", {
      bannedPhrases: ["guaranteed returns"],
      sources: ["the quick brown fox jumps over the lazy dog now and forever"],
    });
    expect(report.ok).toBe(false);
    expect(report.violations.length).toBeGreaterThanOrEqual(2);
  });
});

describe("checkContentSafety — defensive", () => {
  it("empty draft => ok, no violations", () => {
    expect(checkContentSafety("", { bannedPhrases: ["x"] })).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("nullish draft => ok, no violations", () => {
    // @ts-expect-error exercising defensive nullish handling
    expect(checkContentSafety(null)).toEqual({ ok: true, violations: [] });
    // @ts-expect-error exercising defensive undefined handling
    expect(checkContentSafety(undefined)).toEqual({ ok: true, violations: [] });
  });

  it("no options => ok", () => {
    expect(checkContentSafety("any text at all goes here")).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("empty bannedPhrases / sources arrays => ok", () => {
    expect(
      checkContentSafety("hello world", { bannedPhrases: [], sources: [] }),
    ).toEqual({ ok: true, violations: [] });
  });

  it("ignores empty/whitespace banned phrase entries", () => {
    const report = checkContentSafety("hello world", { bannedPhrases: ["", "   "] });
    expect(report.ok).toBe(true);
  });
});
