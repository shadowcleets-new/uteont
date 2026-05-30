import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "./gemini-cost";

describe("estimateCostUsd", () => {
  it("computes flash cost from prompt + completion tokens", () => {
    // 1,000,000 input @ .075 + 1,000,000 output @ .30 = .375
    expect(
      estimateCostUsd("gemini-flash-latest", {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.375, 6);
  });

  it("bills cached tokens at the cheaper cached rate", () => {
    // 1,000,000 prompt all cached, 0 completion = 1,000,000 * .01875 / 1e6
    expect(
      estimateCostUsd("gemini-flash-latest", {
        promptTokens: 1_000_000,
        completionTokens: 0,
        cachedTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.01875, 6);
  });

  it("falls back to flash pricing for an unknown model", () => {
    expect(
      estimateCostUsd("some-unknown-model", {
        promptTokens: 1_000_000,
        completionTokens: 0,
      }),
    ).toBeCloseTo(0.075, 6);
  });

  it("never goes negative when cached exceeds prompt", () => {
    expect(
      estimateCostUsd("gemini-flash-latest", {
        promptTokens: 10,
        completionTokens: 0,
        cachedTokens: 100,
      }),
    ).toBeGreaterThanOrEqual(0);
  });
});
