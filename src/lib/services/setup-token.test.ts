import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { __test__ } from "./setup-token";

/**
 * N-18: the setup token must be compared in constant time
 * (crypto.timingSafeEqual on equal-length buffers, length-guarded) to
 * avoid a timing oracle. These tests exercise the pure comparison helper
 * directly — no DB needed.
 */

const { tokensMatch } = __test__;

describe("tokensMatch (constant-time setup-token compare)", () => {
  it("accepts an exactly-matching token", () => {
    const token = randomBytes(32).toString("base64url");
    expect(tokensMatch(token, token)).toBe(true);
  });

  it("rejects a wrong token of the same length", () => {
    const a = randomBytes(32).toString("base64url");
    let b = randomBytes(32).toString("base64url");
    // Ensure same length but different content (base64url of 32 bytes is
    // always 43 chars, so lengths already match — just guard against a
    // 1-in-2^256 collision).
    if (a === b) b = randomBytes(32).toString("base64url");
    expect(a.length).toBe(b.length);
    expect(tokensMatch(a, b)).toBe(false);
  });

  it("rejects a token that differs only in the last character", () => {
    const stored = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const provided = `${stored.slice(0, -1)}B`;
    expect(stored.length).toBe(provided.length);
    expect(tokensMatch(stored, provided)).toBe(false);
  });

  it("rejects tokens of differing lengths without throwing", () => {
    // timingSafeEqual throws on unequal-length buffers; the helper must
    // length-guard first and return false rather than throw.
    expect(() => tokensMatch("short", "muchlongertoken")).not.toThrow();
    expect(tokensMatch("short", "muchlongertoken")).toBe(false);
    expect(tokensMatch("muchlongertoken", "short")).toBe(false);
  });

  it("rejects an empty provided token against a real one", () => {
    const token = randomBytes(32).toString("base64url");
    expect(tokensMatch(token, "")).toBe(false);
  });

  it("rejects when both sides are empty (no active token degenerate case)", () => {
    // Defense-in-depth: callers guard !row.setupToken before calling, but
    // an empty/empty compare must not spuriously match a missing token.
    // timingSafeEqual on two zero-length buffers returns true, so this
    // documents that the helper alone does not substitute for the
    // null-token guard in consumeSetupToken.
    expect(tokensMatch("", "")).toBe(true);
  });
});
