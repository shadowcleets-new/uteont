import { describe, it, expect } from "vitest";
import { parseStoredValue } from "./use-local-storage";

describe("parseStoredValue", () => {
  it("returns fallback when raw is null", () => {
    expect(parseStoredValue<boolean>(null, false)).toBe(false);
    expect(parseStoredValue<string>(null, "default")).toBe("default");
    expect(parseStoredValue<number>(null, 0)).toBe(0);
  });

  it("parses valid JSON values", () => {
    expect(parseStoredValue<boolean>("true", false)).toBe(true);
    expect(parseStoredValue<number>("42", 0)).toBe(42);
    expect(parseStoredValue<string>('"hello"', "")).toBe("hello");
    expect(parseStoredValue<{ x: number }>('{"x":1}', { x: 0 })).toEqual({
      x: 1,
    });
  });

  it("returns fallback when raw is corrupted JSON", () => {
    expect(parseStoredValue<boolean>("not-json", false)).toBe(false);
    expect(parseStoredValue<{ x: number }>("{x:1}", { x: 99 })).toEqual({
      x: 99,
    });
  });

  it("preserves false / 0 / empty-string stored values (not falsy-folded)", () => {
    expect(parseStoredValue<boolean>("false", true)).toBe(false);
    expect(parseStoredValue<number>("0", 99)).toBe(0);
    expect(parseStoredValue<string>('""', "default")).toBe("");
  });
});
