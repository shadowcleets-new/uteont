import { describe, it, expect } from "vitest";
import { validateUsername, passwordChangeAlertText } from "./auth-config";

describe("validateUsername", () => {
  it("accepts clean handles", () => {
    expect(validateUsername("shadowcleets")).toBeNull();
    expect(validateUsername("a.b_c-d@e")).toBeNull();
  });

  it("rejects empty / whitespace-only", () => {
    expect(validateUsername("   ")).toMatch(/empty/i);
  });

  it("rejects spaces — the /setuser + /setpassword chaining mistake", () => {
    expect(validateUsername("shadowcleets /setpassword Hunter2!Aa")).toMatch(/space|command/i);
  });

  it("rejects a chained slash command", () => {
    expect(validateUsername("foo/bar")).toMatch(/command|slash/i);
  });

  it("rejects too-long usernames (>64)", () => {
    expect(validateUsername("a".repeat(65))).toMatch(/too long|max 64/i);
  });

  it("rejects disallowed characters", () => {
    expect(validateUsername("foo$bar")).toMatch(/only contain|letters/i);
  });
});

describe("passwordChangeAlertText", () => {
  it("warns clearly about an unexpected change", () => {
    const t = passwordChangeAlertText();
    expect(t).toMatch(/password .*changed/i);
    expect(t).toMatch(/wasn.t you/i);
  });
});
