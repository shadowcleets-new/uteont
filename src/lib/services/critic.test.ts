import { describe, it, expect } from "vitest";
import {
  parseCriticVerdict,
  shouldCritique,
  strictnessGuidance,
  isCritiqueStrictness,
  CRITIC_TARGET_AGENTS,
  MAX_CRITIC_ITERATIONS,
} from "./critic";

describe("parseCriticVerdict (binary serves/fails contract)", () => {
  it("reads a serves verdict", () => {
    const v = parseCriticVerdict({ verdict: "serves", recommendation: "" });
    expect(v.verdict).toBe("serves");
    expect(v.recommendation).toBeNull();
  });

  it("reads a fails verdict and keeps the single recommendation", () => {
    const v = parseCriticVerdict({ verdict: "fails", recommendation: "Tighten the intro hook." });
    expect(v.verdict).toBe("fails");
    expect(v.recommendation).toBe("Tighten the intro hook.");
  });

  it("normalizes casing/whitespace and unknown verdicts to fails (fail-closed)", () => {
    expect(parseCriticVerdict({ verdict: "  SERVES ", recommendation: "" }).verdict).toBe("serves");
    expect(parseCriticVerdict({ verdict: "maybe", recommendation: "x" }).verdict).toBe("fails");
  });

  it("a fails verdict with no recommendation still yields a generic one", () => {
    const v = parseCriticVerdict({ verdict: "fails", recommendation: "" });
    expect(v.verdict).toBe("fails");
    expect(v.recommendation).toBeTruthy();
  });
});

describe("shouldCritique (which agents, iteration cap, quota skip)", () => {
  it("runs for reviewable producing agents with budget and iterations left", () => {
    const d = shouldCritique({ agentKey: "content-writing", iteration: 1, budgetFraction: 0.5 });
    expect(d.run).toBe(true);
  });

  it("skips agents not in the critic target set", () => {
    expect(shouldCritique({ agentKey: "technical-seo", iteration: 1, budgetFraction: 0.9 }).run).toBe(false);
    expect(shouldCritique({ agentKey: "site-crawl", iteration: 1, budgetFraction: 0.9 }).run).toBe(false);
  });

  it("skips when the daily Gemini budget is under 10%", () => {
    const d = shouldCritique({ agentKey: "research", iteration: 1, budgetFraction: 0.05 });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/budget/i);
  });

  it("stops once the iteration cap is reached (ship-with-warning)", () => {
    const d = shouldCritique({ agentKey: "research", iteration: MAX_CRITIC_ITERATIONS, budgetFraction: 0.9 });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/iteration|cap/i);
  });
});

describe("strictnessGuidance", () => {
  it("returns distinct guidance per mode", () => {
    const loose = strictnessGuidance("loose");
    const std = strictnessGuidance("standard");
    const ped = strictnessGuidance("pedantic");
    expect(loose).not.toBe(std);
    expect(std).not.toBe(ped);
    expect(ped.toLowerCase()).toMatch(/pedantic|strict|nitpick/);
  });

  it("CRITIC_TARGET_AGENTS covers the producing agents only", () => {
    expect(CRITIC_TARGET_AGENTS).toContain("research");
    expect(CRITIC_TARGET_AGENTS).toContain("idea-generation");
    expect(CRITIC_TARGET_AGENTS).toContain("content-writing");
    expect(CRITIC_TARGET_AGENTS).toContain("backlink");
    expect(CRITIC_TARGET_AGENTS).not.toContain("technical-seo");
  });
});

describe("isCritiqueStrictness", () => {
  it("validates the 3 modes and rejects others", () => {
    expect(isCritiqueStrictness("loose")).toBe(true);
    expect(isCritiqueStrictness("standard")).toBe(true);
    expect(isCritiqueStrictness("pedantic")).toBe(true);
    expect(isCritiqueStrictness("savage")).toBe(false);
    expect(isCritiqueStrictness(undefined)).toBe(false);
  });
});
