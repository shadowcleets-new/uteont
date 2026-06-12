import { describe, it, expect } from "vitest";
import { parseExportDate } from "./keywords-filters";

describe("parseExportDate (A-11 date validation)", () => {
  it("parses a valid ISO date", () => {
    const d = parseExportDate("2026-01-15");
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString().slice(0, 10)).toBe("2026-01-15");
  });

  it("returns undefined for an empty/absent value", () => {
    expect(parseExportDate(undefined)).toBeUndefined();
    expect(parseExportDate("")).toBeUndefined();
  });

  it("throws on a malformed date instead of silently yielding Invalid Date", () => {
    expect(() => parseExportDate("not-a-date")).toThrow();
    expect(() => parseExportDate("2026-13-99")).toThrow();
  });
});
