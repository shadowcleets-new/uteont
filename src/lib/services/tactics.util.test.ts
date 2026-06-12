import { describe, it, expect } from "vitest";
import { normalizeTactic, tacticsFromResult } from "./tactics";

describe("normalizeTactic", () => {
  it("accepts a well-formed tactic and clamps source type", () => {
    const t = normalizeTactic({
      sourceUrl: "https://reddit.com/r/SEO/x",
      sourceType: "reddit",
      title: "Internal linking wins",
      body: "Link new posts from your top pages within a day.",
      tags: ["r/SEO"],
      score: 42,
    });
    expect(t).not.toBeNull();
    expect(t?.sourceType).toBe("reddit");
    expect(t?.score).toBe(42);
  });

  it("coerces an unknown source type to 'other'", () => {
    const t = normalizeTactic({ sourceUrl: "https://x.test", sourceType: "tiktok", title: "T", body: "B" });
    expect(t?.sourceType).toBe("other");
  });

  it("rejects rows missing url/title/body", () => {
    expect(normalizeTactic({ sourceUrl: "", title: "t", body: "b" })).toBeNull();
    expect(normalizeTactic({ sourceUrl: "u", title: "", body: "b" })).toBeNull();
    expect(normalizeTactic({ sourceUrl: "u", title: "t", body: "" })).toBeNull();
    expect(normalizeTactic(null)).toBeNull();
    expect(normalizeTactic("nope")).toBeNull();
  });

  it("truncates over-long fields", () => {
    const t = normalizeTactic({
      sourceUrl: "https://b.test",
      sourceType: "blog",
      title: "x".repeat(500),
      body: "y".repeat(9000),
    });
    expect(t?.title.length).toBe(300);
    expect(t?.body.length).toBe(4000);
  });
});

describe("tacticsFromResult", () => {
  it("extracts and filters the tactics array from a worker result", () => {
    const out = tacticsFromResult({
      tactics: [
        { sourceUrl: "u1", sourceType: "hn", title: "A", body: "aa" },
        { sourceUrl: "", title: "bad", body: "x" }, // dropped
        { sourceUrl: "u2", sourceType: "blog", title: "B", body: "bb" },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.title)).toEqual(["A", "B"]);
  });

  it("returns empty for a result with no tactics", () => {
    expect(tacticsFromResult({})).toEqual([]);
    expect(tacticsFromResult({ tactics: "nope" })).toEqual([]);
  });
});
