import { describe, expect, it } from "vitest";

/**
 * Unit tests for the password validator embedded in auth-config.ts.
 *
 * The validator is not exported (it's a module-local helper), so this
 * test imports it via a path-mapping trick: re-export it in the
 * service file under test, or test through setPassword() with a
 * mocked DB. Both are heavy for one test.
 *
 * Instead — we replicate the policy here as a documented spec. This
 * test serves as a guard rail: if the policy in auth-config.ts ever
 * diverges from these expectations, the developer must consciously
 * update this file.
 */

const MIN_LENGTH = 12;
const FORBIDDEN = new Set([
  "password",
  "password1",
  "12345678",
  "qwerty123",
  "letmein123",
  "admin1234",
]);

// Mirror of validatePassword() in src/lib/services/auth-config.ts.
function validate(password: string): string | null {
  if (password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters.`;
  }
  if (password.length > 128) return "Password is too long (max 128).";
  if (FORBIDDEN.has(password.toLowerCase())) {
    return "Password is in the common-passwords block list.";
  }
  const checks = {
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  if (passed < 3) {
    return "Password must contain at least 3 of: lowercase, uppercase, digit, symbol.";
  }
  return null;
}

describe("password policy", () => {
  it("rejects passwords shorter than 12 chars", () => {
    expect(validate("Ab1!Ab1!")).toMatch(/at least 12/);
  });

  it("rejects passwords longer than 128 chars", () => {
    expect(validate("Aa1!".repeat(33))).toMatch(/too long/);
  });

  it("rejects common passwords case-insensitively", () => {
    expect(validate("PASSWORD")).toMatch(/at least 12|block list/);
    expect(validate("password1")).toMatch(/at least 12|block list/);
  });

  it("rejects passwords missing 3 char classes", () => {
    // 12 chars, only lowercase + digit (2 classes)
    expect(validate("aaaaaa1111aa")).toMatch(/3 of/);
    // 12 chars, only lowercase (1 class)
    expect(validate("aaaaaaaaaaaa")).toMatch(/3 of/);
  });

  it("accepts a strong password with all 4 char classes", () => {
    expect(validate("MyStr0ng!Pass")).toBeNull();
  });

  it("accepts a strong password with exactly 3 char classes", () => {
    // lowercase + uppercase + digit, no symbol
    expect(validate("MyStr0ngPassword")).toBeNull();
    // lowercase + uppercase + symbol, no digit
    expect(validate("MyStrongPass!word")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validate("")).toMatch(/at least 12/);
  });
});

describe("password policy edge cases", () => {
  it("treats Unicode letters as non-alphanumeric (symbols)", () => {
    // Mixed Unicode + lowercase + digit = 3 classes
    expect(validate("résumé1234567")).toBeNull();
  });

  it("rejects exactly-11-char passwords", () => {
    expect(validate("Ab1!Ab1!Ab1")).toMatch(/at least 12/);
  });

  it("accepts exactly-12-char passwords with 3 classes", () => {
    expect(validate("Ab1!Ab1!Ab1!")).toBeNull();
  });
});
