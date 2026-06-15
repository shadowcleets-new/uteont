import { describe, it, expect } from "vitest";
import { FLAG_DEFAULTS, isFlagEnabled } from "./flags";

describe("FLAG_DEFAULTS", () => {
  it("declares intelligence_engine off by default", () => {
    expect(FLAG_DEFAULTS.intelligence_engine).toBe(false);
  });
});

describe("isFlagEnabled", () => {
  it("returns the override when present (true)", () => {
    expect(isFlagEnabled({ intelligence_engine: true }, "intelligence_engine")).toBe(true);
  });

  it("returns the override when present (false)", () => {
    // A real boolean override of `false` must win even when the default is true.
    expect(isFlagEnabled({ some_default_on: false }, "some_default_on")).toBe(false);
  });

  it("falls back to the default when the key is absent", () => {
    expect(isFlagEnabled({}, "intelligence_engine")).toBe(FLAG_DEFAULTS.intelligence_engine);
    expect(isFlagEnabled({ other: true }, "intelligence_engine")).toBe(false);
  });

  it("falls back when settings is null or undefined", () => {
    expect(isFlagEnabled(null, "intelligence_engine")).toBe(false);
    expect(isFlagEnabled(undefined, "intelligence_engine")).toBe(false);
  });

  it("ignores non-boolean override values and falls back to the default", () => {
    expect(isFlagEnabled({ intelligence_engine: "true" }, "intelligence_engine")).toBe(false);
    expect(isFlagEnabled({ intelligence_engine: 1 }, "intelligence_engine")).toBe(false);
    expect(isFlagEnabled({ intelligence_engine: null }, "intelligence_engine")).toBe(false);
    expect(isFlagEnabled({ intelligence_engine: {} }, "intelligence_engine")).toBe(false);
  });

  it("ignores inherited (non-own) properties and falls back", () => {
    const proto = { intelligence_engine: true };
    const settings = Object.create(proto) as Record<string, unknown>;
    expect(isFlagEnabled(settings, "intelligence_engine")).toBe(false);
  });

  it("returns false for an unknown key with no default", () => {
    expect(isFlagEnabled({}, "does_not_exist")).toBe(false);
    expect(isFlagEnabled({ does_not_exist: "yes" }, "does_not_exist")).toBe(false);
  });
});
