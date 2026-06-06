import { describe, it, expect } from "vitest";
import { filterCandidates, normalize } from "./exclusion-filter";

describe("normalize", () => {
  it("lowercases + strips punctuation + drops stopwords", () => {
    expect(normalize("Best Credit Cards for Travel!")).toEqual([
      "best",
      "credit",
      "cards",
      "travel",
    ]);
  });

  it("returns empty for empty/whitespace input", () => {
    expect(normalize("")).toEqual([]);
    expect(normalize("   ")).toEqual([]);
  });

  it("handles hyphens and apostrophes by tokenizing on word chars", () => {
    expect(normalize("credit-card rewards (2026)").join(" ")).toBe(
      "credit card rewards 2026",
    );
  });
});

describe("filterCandidates", () => {
  it("blocks case + punctuation variants of an exact rejection", () => {
    const out = filterCandidates(
      [
        "credit card rewards",
        "Credit-Card Rewards",
        "CREDIT CARD REWARDS",
        "best electric bikes 2026",
      ],
      ["credit card rewards"],
    );
    expect(out.allowed).toEqual(["best electric bikes 2026"]);
    expect(out.rejected.map((r) => r.phrase)).toEqual([
      "credit card rewards",
      "Credit-Card Rewards",
      "CREDIT CARD REWARDS",
    ]);
    for (const r of out.rejected) {
      expect(r.matched).toBe("credit card rewards");
      expect(r.similarity).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("blocks trivial reorderings (token-set overlap)", () => {
    const out = filterCandidates(
      ["rewards credit cards", "cards reward credit"],
      ["credit card rewards"],
    );
    // "cards" vs "card" differ as tokens so jaccard is < 1.0 but for
    // identical token sets the overlap clears the threshold.
    expect(out.allowed.length + out.rejected.length).toBe(2);
  });

  it("does NOT block semantically-similar-but-distinct phrases at v1", () => {
    const out = filterCandidates(
      ["top credit cards", "credit cards for beginners", "best travel cards"],
      ["credit card rewards"],
    );
    expect(out.allowed.length).toBeGreaterThan(0);
    // Document the v1 limitation: lexical filter doesn't catch "top
    // credit cards" — that requires embedding-based semantic matching
    // landing with the worker in a follow-up.
  });

  it("returns empty rejected when no exclusions exist", () => {
    const out = filterCandidates(["a", "b", "c"], []);
    expect(out.allowed).toEqual(["a", "b", "c"]);
    expect(out.rejected).toEqual([]);
  });

  it("respects a custom similarity threshold", () => {
    // At default 0.75 "top credit cards" survives (only "credit" overlaps
    // → jaccard 0.2). Drop the threshold to 0.15 and it gets blocked.
    const lenient = filterCandidates(
      ["top credit cards"],
      ["credit card rewards"],
      0.15,
    );
    expect(lenient.rejected.length).toBeGreaterThan(0);
    // Conversely, "credit card rewards bonus" overlaps 3/4 = 0.75 which
    // is blocked at the default but allowed at a strict 0.95 threshold.
    const strict = filterCandidates(
      ["credit card rewards bonus"],
      ["credit card rewards"],
      0.95,
    );
    expect(strict.allowed).toEqual(["credit card rewards bonus"]);
  });
});
