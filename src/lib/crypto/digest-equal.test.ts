import { describe, it, expect } from "vitest";
import { safeEqualDigest } from "./digest-equal";

describe("safeEqualDigest (length-independent constant-time compare)", () => {
  it("returns true for identical strings", async () => {
    expect(await safeEqualDigest("Bearer abc123", "Bearer abc123")).toBe(true);
  });

  it("returns false for different strings of equal length", async () => {
    expect(await safeEqualDigest("Bearer abc123", "Bearer abc124")).toBe(false);
  });

  it("returns false for different lengths (comparison is over fixed-size digests)", async () => {
    expect(await safeEqualDigest("short", "a much longer secret value")).toBe(false);
  });

  it("treats empty/undefined as non-matching, never throwing", async () => {
    expect(await safeEqualDigest("", "x")).toBe(false);
    expect(await safeEqualDigest(undefined, "x")).toBe(false);
    expect(await safeEqualDigest("x", undefined)).toBe(false);
  });

  it("handles non-ASCII", async () => {
    expect(await safeEqualDigest("tökén-✓", "tökén-✓")).toBe(true);
    expect(await safeEqualDigest("tökén-✓", "tökén-✗")).toBe(false);
  });
});
