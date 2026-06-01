import { describe, it, expect } from "vitest";
import { buildDraftPrompt, normalizeDraft, runContentDraft } from "./content-draft";

describe("buildDraftPrompt", () => {
  it("includes the topic, keyword, brief inputs and JSON contract", () => {
    const p = buildDraftPrompt({
      topic: "B2B textile manufacturing",
      keyword: "textile manufacturing",
      missingTerms: ["polyester", "sustainability"],
      missingTopics: ["Dyeing process"],
      recommendedWordCount: 1500,
      voice: "authoritative",
      bannedPhrases: ["cheap"],
    });
    expect(p).toContain("B2B textile manufacturing");
    expect(p).toContain('keyword to target naturally: "textile manufacturing"');
    expect(p).toContain("~1500 words");
    expect(p).toContain("polyester, sustainability");
    expect(p).toContain("Dyeing process");
    expect(p).toContain("Never use these phrases: cheap");
    expect(p).toContain("draftMarkdown");
  });

  it("defaults the length when not provided", () => {
    expect(buildDraftPrompt({ topic: "x" })).toContain("~1200 words");
  });
});

describe("normalizeDraft", () => {
  it("normalizes a well-formed model response and counts words", () => {
    const d = normalizeDraft({
      title: "The Guide",
      metaTitle: "Guide",
      metaDescription: "A guide.",
      outline: ["Intro", "Body", "Conclusion"],
      draftMarkdown: "## Intro\nHello world here we go",
    });
    expect(d.title).toBe("The Guide");
    expect(d.outline).toEqual(["Intro", "Body", "Conclusion"]);
    expect(d.wordCount).toBeGreaterThan(3);
  });

  it("tolerates missing/garbage fields", () => {
    const d = normalizeDraft({});
    expect(d.title).toBe("Untitled draft");
    expect(d.outline).toEqual([]);
    expect(d.wordCount).toBe(0);
  });

  it("clamps over-long meta fields", () => {
    const d = normalizeDraft({ metaTitle: "x".repeat(200), metaDescription: "y".repeat(400) });
    expect(d.metaTitle.length).toBeLessThanOrEqual(70);
    expect(d.metaDescription.length).toBeLessThanOrEqual(200);
  });
});

describe("runContentDraft", () => {
  it("degrades (not throws) when no topic is given", async () => {
    const r = await runContentDraft({ topic: "  " });
    expect(r.configured).toBe(false);
    expect(r.note).toContain("topic");
  });

  it("degrades with a clear note when GEMINI_API_KEY is absent", async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const r = await runContentDraft({ topic: "widgets" });
      expect(r.configured).toBe(false);
      expect(r.note).toContain("GEMINI_API_KEY");
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });
});
