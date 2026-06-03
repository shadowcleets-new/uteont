import { describe, it, expect } from "vitest";
import { linearRegression, projectRegression, regressionConfidenceLevel } from "./target-history";

const DAY = 86_400_000;
const pt = (dayIdx: number, value: number) => ({ value, capturedAt: dayIdx * DAY });

describe("linearRegression", () => {
  it("returns null with fewer than 2 points", () => {
    expect(linearRegression([])).toBeNull();
    expect(linearRegression([pt(0, 5)])).toBeNull();
  });

  it("fits a perfect line with slope per day + intercept + r2=1", () => {
    const reg = linearRegression([pt(0, 10), pt(1, 12), pt(2, 14), pt(3, 16)])!;
    expect(reg.slopePerDay).toBeCloseTo(2, 6);
    expect(reg.intercept).toBeCloseTo(10, 6);
    expect(reg.r2).toBeCloseTo(1, 6);
    expect(reg.residualSd).toBeCloseTo(0, 6);
    expect(reg.n).toBe(4);
  });

  it("projects the fitted line to a future timestamp", () => {
    const reg = linearRegression([pt(0, 10), pt(1, 12), pt(2, 14)])!;
    expect(projectRegression(reg, 5 * DAY)).toBeCloseTo(20, 6);
  });

  it("reports an intermediate r2 for noisy data", () => {
    const reg = linearRegression([pt(0, 10), pt(1, 9), pt(2, 14), pt(3, 11), pt(4, 18)])!;
    expect(reg.r2).toBeGreaterThan(0);
    expect(reg.r2).toBeLessThan(1);
    expect(reg.residualSd).toBeGreaterThan(0);
  });

  it("handles a flat series (zero slope)", () => {
    const reg = linearRegression([pt(0, 7), pt(1, 7), pt(2, 7)])!;
    expect(reg.slopePerDay).toBeCloseTo(0, 6);
  });
});

describe("regressionConfidenceLevel", () => {
  it("is low for null or too-few samples", () => {
    expect(regressionConfidenceLevel(null)).toBe("low");
    expect(regressionConfidenceLevel(linearRegression([pt(0, 1), pt(1, 2)]))).toBe("low");
  });

  it("is high for a clean line with enough samples", () => {
    const reg = linearRegression([pt(0, 10), pt(1, 12), pt(2, 14), pt(3, 16), pt(4, 18)]);
    expect(regressionConfidenceLevel(reg)).toBe("high");
  });

  it("is at most medium for a noisy short series", () => {
    const reg = linearRegression([pt(0, 10), pt(1, 2), pt(2, 15)]);
    expect(["low", "medium"]).toContain(regressionConfidenceLevel(reg));
  });
});
