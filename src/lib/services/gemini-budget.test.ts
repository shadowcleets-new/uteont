import { describe, it, expect } from "vitest";
import { remainingFraction, dailyBudgetKey, GEMINI_DAILY_CAP } from "./gemini-budget";

describe("remainingFraction (daily Gemini budget math)", () => {
  it("is 1 when nothing has been spent", () => {
    expect(remainingFraction(0, 1500)).toBe(1);
  });

  it("is 0.5 at half the cap", () => {
    expect(remainingFraction(750, 1500)).toBe(0.5);
  });

  it("clamps to 0 when over the cap (never negative)", () => {
    expect(remainingFraction(2000, 1500)).toBe(0);
  });

  it("falls back to the default cap and handles a zero/invalid cap as exhausted", () => {
    expect(remainingFraction(10, 0)).toBe(0);
    expect(GEMINI_DAILY_CAP).toBeGreaterThan(0);
  });
});

describe("dailyBudgetKey", () => {
  it("namespaces by UTC date", () => {
    expect(dailyBudgetKey(new Date("2026-06-12T23:30:00Z"))).toBe("gemini.budget.2026-06-12");
  });
});
