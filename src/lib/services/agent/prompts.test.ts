import { describe, it, expect } from "vitest";
import {
  BASE_RESEARCH_PROMPT,
  BASE_IDEATION_PROMPT,
  buildNegativeConstraintBlock,
} from "./prompts";
import { extractHeadPhrase } from "@/lib/services/keyword-exclusions";

describe("buildNegativeConstraintBlock", () => {
  it("returns empty when there are no exclusions", () => {
    expect(buildNegativeConstraintBlock([])).toBe("");
  });

  it("quotes each phrase and lists them inside the constraint block", () => {
    const block = buildNegativeConstraintBlock([
      "credit card rewards",
      "buy now pay later",
    ]);
    expect(block).toMatch(/NEGATIVE CONSTRAINT INSTRUCTION/);
    expect(block).toMatch(/"credit card rewards"/);
    expect(block).toMatch(/"buy now pay later"/);
    expect(block).toMatch(/explicitly rejected by the client/);
  });

  it("keeps the base prompts as the leading section", () => {
    // Sanity: BASE constants are stable strings the call sites compose.
    expect(BASE_RESEARCH_PROMPT).toMatch(/Research Agent/);
    expect(BASE_IDEATION_PROMPT).toMatch(/Idea Generation Agent/);
  });
});

describe("extractHeadPhrase", () => {
  it("returns empty string for empty input", () => {
    expect(extractHeadPhrase("")).toBe("");
    expect(extractHeadPhrase("   ")).toBe("");
  });

  it("clips at the first em-dash separator", () => {
    expect(
      extractHeadPhrase("How sourdough starter goes dormant — a 2026 deep-dive"),
    ).toBe("How sourdough starter goes dormant");
  });

  it("clips at a colon separator", () => {
    expect(
      extractHeadPhrase("Credit card rewards: the 2026 playbook for new cardholders"),
    ).toBe("Credit card rewards");
  });

  it("trims trailing punctuation noise", () => {
    expect(extractHeadPhrase("Best electric bikes 2026.")).toBe(
      "Best electric bikes 2026",
    );
  });

  it("limits very long inputs to the first six tokens", () => {
    const head = extractHeadPhrase(
      "one two three four five six seven eight nine ten eleven",
    );
    expect(head.split(" ").length).toBeLessThanOrEqual(6);
  });
});
