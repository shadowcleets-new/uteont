import { describe, it, expect } from "vitest";
import { parseClientIp } from "./login-attempts";

describe("parseClientIp (A-10 source-IP extraction)", () => {
  it("takes the first hop from x-forwarded-for", () => {
    expect(parseClientIp("203.0.113.7, 70.41.3.18, 150.172.238.178", null)).toBe("203.0.113.7");
  });

  it("trims whitespace around the forwarded IP", () => {
    expect(parseClientIp("  203.0.113.7 ", null)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(parseClientIp(null, "198.51.100.5")).toBe("198.51.100.5");
  });

  it("returns null when neither header is present", () => {
    expect(parseClientIp(null, null)).toBeNull();
    expect(parseClientIp("", "")).toBeNull();
  });
});
