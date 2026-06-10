import { describe, it, expect } from "vitest";
import { projectedComplexity, costTier } from "./cost-projection";

describe("projectedComplexity", () => {
  it("computes wordCount * coverageScore * 1.4", () => {
    expect(projectedComplexity(1000, 50)).toBeCloseTo(70000);
    expect(projectedComplexity(800, 70)).toBeCloseTo(78400);
    expect(projectedComplexity(500, 30)).toBeCloseTo(21000);
  });

  it("returns 0 when either input is non-positive", () => {
    expect(projectedComplexity(0, 50)).toBe(0);
    expect(projectedComplexity(1000, 0)).toBe(0);
    expect(projectedComplexity(-1, 50)).toBe(0);
    expect(projectedComplexity(1000, -1)).toBe(0);
  });

  it("returns 0 for NaN / Infinity", () => {
    expect(projectedComplexity(NaN, 50)).toBe(0);
    expect(projectedComplexity(1000, NaN)).toBe(0);
    expect(projectedComplexity(Infinity, 50)).toBe(0);
  });
});

describe("costTier", () => {
  it("returns 'green' under 5000", () => {
    const t = costTier(4999);
    expect(t.tier).toBe("green");
    expect(t.label).toBe("Highly Cost-Effective");
    expect(t.fill).toBe("#788c5d");
  });

  it("returns 'amber' between 5000 and 12000 inclusive", () => {
    expect(costTier(5000).tier).toBe("amber");
    expect(costTier(8000).tier).toBe("amber");
    expect(costTier(12000).tier).toBe("amber");
  });

  it("returns 'red' above 12000", () => {
    expect(costTier(12001).tier).toBe("red");
    expect(costTier(30000).tier).toBe("red");
    expect(costTier(99999).tier).toBe("red");
  });

  it("renders percent ramping from 0 to 100 against the 30k cap", () => {
    expect(costTier(0).percent).toBe(0);
    expect(costTier(15000).percent).toBeCloseTo(50);
    expect(costTier(30000).percent).toBe(100);
    expect(costTier(60000).percent).toBe(100);
  });
});
