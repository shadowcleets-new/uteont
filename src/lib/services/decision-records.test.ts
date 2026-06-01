import { describe, it, expect } from "vitest";
import { confidenceLabel } from "./decision-records";

describe("confidenceLabel", () => {
  it("returns a dash for missing/invalid confidence", () => {
    expect(confidenceLabel(null)).toEqual({ label: "—", pct: 0 });
    expect(confidenceLabel(undefined)).toEqual({ label: "—", pct: 0 });
    expect(confidenceLabel(Number.NaN)).toEqual({ label: "—", pct: 0 });
  });

  it("clamps to 0..100 and bands the label", () => {
    expect(confidenceLabel(-1)).toEqual({ label: "low", pct: 0 });
    expect(confidenceLabel(0.4)).toEqual({ label: "low", pct: 40 });
    expect(confidenceLabel(0.5)).toEqual({ label: "moderate", pct: 50 });
    expect(confidenceLabel(0.8)).toEqual({ label: "high", pct: 80 });
    expect(confidenceLabel(2)).toEqual({ label: "high", pct: 100 });
  });
});
