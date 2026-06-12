import { describe, it, expect } from "vitest";
import { safeEqual } from "./constant-time";

describe("safeEqual (A-08 edge-safe constant-time comparison)", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("Bearer abc123", "Bearer abc123")).toBe(true);
  });

  it("returns false for differing strings of equal length", () => {
    expect(safeEqual("Bearer abc123", "Bearer abc124")).toBe(false);
  });

  it("returns false for differing lengths without throwing", () => {
    expect(safeEqual("short", "a much longer secret value")).toBe(false);
  });

  it("returns false when one string is a prefix of the other", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abcd", "abc")).toBe(false);
  });

  it("treats empty/undefined inputs as non-matching, never throwing", () => {
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual(undefined, "x")).toBe(false);
    expect(safeEqual("x", undefined)).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
  });

  it("handles non-ASCII content", () => {
    expect(safeEqual("tökén-✓", "tökén-✓")).toBe(true);
    expect(safeEqual("tökén-✓", "tökén-✗")).toBe(false);
  });
});
