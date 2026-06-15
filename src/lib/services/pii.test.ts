import { describe, it, expect } from "vitest";
import { redactPII, redactPIIDetailed } from "./pii";

describe("redactPII", () => {
  it("replaces an email with [redacted-email] and counts 1", () => {
    const input = "Contact us at jane.doe@example.com for help.";
    const out = redactPII(input);
    expect(out).toContain("[redacted-email]");
    expect(out).not.toContain("jane.doe@example.com");
    expect(redactPIIDetailed(input).counts.emails).toBe(1);
  });

  it("replaces several phone formats each with [redacted-phone]", () => {
    const samples = [
      "+1 415 555 2671",
      "(123) 456-7890",
      "123-456-7890",
      "123.456.7890",
      "+44 20 7946 0958",
    ];
    for (const s of samples) {
      const out = redactPII(`call ${s} now`);
      expect(out).toContain("[redacted-phone]");
      expect(out).not.toMatch(/\d{3}/); // no raw 3-digit run of the phone survives
    }
  });

  it("leaves clean text with a year and a price unchanged (no false positives)", () => {
    const input = "In 2026 the budget was $1,200 for the quarter.";
    expect(redactPII(input)).toBe(input);
    const detailed = redactPIIDetailed(input);
    expect(detailed.counts.emails).toBe(0);
    expect(detailed.counts.phones).toBe(0);
  });

  it("is idempotent: redactPII(redactPII(x)) === redactPII(x)", () => {
    const input = "Mail bob@acme.io or ring (123) 456-7890 anytime.";
    const once = redactPII(input);
    expect(redactPII(once)).toBe(once);
  });

  it("mixed email + phone yields counts { emails:1, phones:1 }", () => {
    const input = "Reach jane.doe@example.com or +1 415 555 2671.";
    const result = redactPIIDetailed(input);
    expect(result.counts).toEqual({ emails: 1, phones: 1 });
    expect(result.text).toContain("[redacted-email]");
    expect(result.text).toContain("[redacted-phone]");
  });

  it("coerces non-string input to empty string", () => {
    // @ts-expect-error testing runtime null-safety
    expect(redactPII(null)).toBe("");
    // @ts-expect-error testing runtime undefined-safety
    expect(redactPII(undefined)).toBe("");
    // @ts-expect-error testing runtime number coercion
    expect(redactPIIDetailed(42).text).toBe("");
  });
});
