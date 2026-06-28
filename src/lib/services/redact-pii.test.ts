import { describe, it, expect } from "vitest";

import { redactPII } from "./redact-pii";

describe("redactPII", () => {
  // #region Null / empty safety
  it("returns '' for nullish / empty input", () => {
    expect(redactPII("")).toBe("");
    // @ts-expect-error exercising runtime null safety
    expect(redactPII(null)).toBe("");
    // @ts-expect-error exercising runtime undefined safety
    expect(redactPII(undefined)).toBe("");
    // @ts-expect-error exercising runtime non-string safety
    expect(redactPII(12345)).toBe("");
  });
  // #endregion

  // #region Email redaction
  it("redacts an email address", () => {
    expect(redactPII("ping me at jane.doe+spam@example.co.uk please")).toBe(
      "ping me at [redacted-email] please",
    );
  });

  it("redacts multiple emails in one string", () => {
    expect(redactPII("a@b.com and c.d@e-f.org")).toBe(
      "[redacted-email] and [redacted-email]",
    );
  });
  // #endregion

  // #region Phone redaction (international + US formats)
  it("redacts +1 415-555-2671 (international dashed)", () => {
    expect(redactPII("call +1 415-555-2671 now")).toBe(
      "call [redacted-phone] now",
    );
  });

  it("redacts (415) 555-2671 (US parenthesized)", () => {
    expect(redactPII("ph (415) 555-2671")).toBe("ph [redacted-phone]");
  });

  it("redacts 415.555.2671 (dotted)", () => {
    expect(redactPII("fax 415.555.2671 ok")).toBe("fax [redacted-phone] ok");
  });

  it("redacts 4155552671 (bare 10 digits)", () => {
    expect(redactPII("num 4155552671 end")).toBe("num [redacted-phone] end");
  });

  it("redacts a long international number +44 20 7946 0958", () => {
    expect(redactPII("uk +44 20 7946 0958 line")).toBe(
      "uk [redacted-phone] line",
    );
  });
  // #endregion

  // #region Conservative: do NOT redact short numbers
  it("does NOT redact a 4-digit year", () => {
    expect(redactPII("released in 2026 to acclaim")).toBe(
      "released in 2026 to acclaim",
    );
  });

  it("does NOT redact a short id like 'id 123'", () => {
    expect(redactPII("see id 123 for details")).toBe("see id 123 for details");
  });

  it("does NOT redact a 9-digit number (under threshold)", () => {
    expect(redactPII("ref 123456789 here")).toBe("ref 123456789 here");
  });
  // #endregion

  // #region Mixed text + idempotency
  it("keeps surrounding words in mixed text", () => {
    const input = "Contact jane@acme.io or call (212) 555-0199 anytime.";
    expect(redactPII(input)).toBe(
      "Contact [redacted-email] or call [redacted-phone] anytime.",
    );
  });

  it("is idempotent (running twice is stable)", () => {
    const input = "mail a@b.com phone +1 415-555-2671 year 2026 id 123";
    const once = redactPII(input);
    const twice = redactPII(once);
    expect(twice).toBe(once);
    expect(once).toBe(
      "mail [redacted-email] phone [redacted-phone] year 2026 id 123",
    );
  });
  // #endregion

  // #region Fail-closed on internal error (N-23)
  it("fails CLOSED (never leaks raw input) when the redaction engine throws", () => {
    const raw = "leak me jane@example.com and +1 415-555-2671";
    const realReplace = String.prototype.replace;
    // Force the internal redaction path to throw on the first .replace() call.
    String.prototype.replace = function (): never {
      throw new Error("forced internal failure");
    };

    try {
      const out = redactPII(raw);
      // Must NOT return the raw, unredacted text (fail open). Empty-safe value
      // is acceptable; presence of any PII fragment is not.
      expect(out).not.toBe(raw);
      expect(out).toBe("");
      expect(out).not.toContain("jane@example.com");
      expect(out).not.toContain("415-555-2671");
    } finally {
      String.prototype.replace = realReplace;
    }
  });
  // #endregion
});
