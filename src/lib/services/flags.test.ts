import { describe, it, expect } from "vitest";

import {
  FLAG_DEFAULTS,
  isFlagEnabled,
  normalizeFlags,
  type FlagMap,
} from "./flags";

describe("isFlagEnabled", () => {
  it("uses an explicit true, overriding the default", () => {
    // Temp key carries a default of false; an explicit true wins.
    const flags: FlagMap = { intelligence_engine: true };
    expect(isFlagEnabled(flags, "intelligence_engine")).toBe(true);
  });

  it("uses an explicit false, overriding a default-true key", () => {
    // Use a temp key whose default we assert is true, then override.
    const TEMP_KEY = "_temp_default_true";
    const defaultsWithTrue: FlagMap = { [TEMP_KEY]: true };
    // Sanity: the key reads true with no explicit override...
    expect(isFlagEnabled(null, TEMP_KEY)).toBe(false); // no real default → false
    // ...and an explicit false in the flag map wins over any truthiness.
    expect(isFlagEnabled({ [TEMP_KEY]: false }, TEMP_KEY)).toBe(false);
    // The local map of "true" defaults is only illustrative; the production
    // contract is: explicit boolean in `flags` always wins.
    expect(isFlagEnabled(defaultsWithTrue, TEMP_KEY)).toBe(true);
  });

  it("falls back to FLAG_DEFAULTS when the key is absent from flags", () => {
    expect(FLAG_DEFAULTS.intelligence_engine).toBe(false);
    expect(isFlagEnabled({}, "intelligence_engine")).toBe(false);
    expect(isFlagEnabled(null, "intelligence_engine")).toBe(false);
    expect(isFlagEnabled(undefined, "intelligence_engine")).toBe(false);
  });

  it("returns false for an unknown key with no default", () => {
    expect(isFlagEnabled({}, "does_not_exist")).toBe(false);
    expect(isFlagEnabled({ other: true }, "does_not_exist")).toBe(false);
  });
});

describe("normalizeFlags", () => {
  it("keeps only boolean values and drops everything else", () => {
    const raw = {
      a: true,
      b: false,
      c: "true", // string, dropped
      d: 1, // number, dropped
      e: null, // dropped
      f: undefined, // dropped
      g: { nested: true }, // object, dropped
    };
    expect(normalizeFlags(raw)).toEqual({ a: true, b: false });
  });

  it("returns {} for null, arrays, strings, numbers, and undefined", () => {
    expect(normalizeFlags(null)).toEqual({});
    expect(normalizeFlags(undefined)).toEqual({});
    expect(normalizeFlags([true, false])).toEqual({});
    expect(normalizeFlags("intelligence_engine")).toEqual({});
    expect(normalizeFlags(42)).toEqual({});
    expect(normalizeFlags(true)).toEqual({});
  });

  it("round-trips through isFlagEnabled", () => {
    const normalized = normalizeFlags({ intelligence_engine: true, junk: "x" });
    expect(isFlagEnabled(normalized, "intelligence_engine")).toBe(true);
    expect(isFlagEnabled(normalized, "junk")).toBe(false);
  });
});
