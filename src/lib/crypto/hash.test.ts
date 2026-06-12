import { describe, it, expect } from "vitest";
import { sha256Hex } from "./hash";

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
