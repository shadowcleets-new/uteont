import { describe, it, expect } from "vitest";
import { safeEqual, sha256Hex } from "./constant-time";

describe("safeEqual (A-08 constant-time comparison)", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("Bearer abc123", "Bearer abc123")).toBe(true);
  });

  it("returns false for differing strings of equal length", () => {
    expect(safeEqual("Bearer abc123", "Bearer abc124")).toBe(false);
  });

  it("returns false for differing lengths without throwing", () => {
    expect(safeEqual("short", "a much longer secret value")).toBe(false);
  });

  it("treats empty/undefined inputs as non-matching, never throwing", () => {
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual(undefined, "x")).toBe(false);
    expect(safeEqual("x", undefined)).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
  });
});

describe("sha256Hex (A-15 token hashing)", () => {
  it("produces the known SHA-256 hex digest", () => {
    // echo -n "abc" | sha256sum
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic and differs for different inputs", () => {
    expect(sha256Hex("token-a")).toBe(sha256Hex("token-a"));
    expect(sha256Hex("token-a")).not.toBe(sha256Hex("token-b"));
  });
});
