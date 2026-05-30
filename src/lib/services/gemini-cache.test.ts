import { describe, it, expect, vi, afterEach } from "vitest";
import { getOrCreateCachedContent } from "./gemini-cache";

const ORIGINAL_SWITCH = process.env.GEMINI_CONTEXT_CACHE;
const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_SWITCH === undefined) delete process.env.GEMINI_CONTEXT_CACHE;
  else process.env.GEMINI_CONTEXT_CACHE = ORIGINAL_SWITCH;
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
});

describe("getOrCreateCachedContent", () => {
  it("returns null and never calls fetch when GEMINI_CONTEXT_CACHE=off", async () => {
    process.env.GEMINI_CONTEXT_CACHE = "off";
    process.env.GEMINI_API_KEY = "k";
    const fetchSpy = vi.spyOn(global, "fetch");
    const out = await getOrCreateCachedContent({
      model: "gemini-flash-latest",
      systemInstruction: "x",
    });
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_CONTEXT_CACHE;
    delete process.env.GEMINI_API_KEY;
    const out = await getOrCreateCachedContent({
      model: "gemini-flash-latest",
      systemInstruction: "x",
    });
    expect(out).toBeNull();
  });

  it("returns null (no fetch) for a sub-threshold system instruction", async () => {
    delete process.env.GEMINI_CONTEXT_CACHE;
    process.env.GEMINI_API_KEY = "k";
    const fetchSpy = vi.spyOn(global, "fetch");
    const out = await getOrCreateCachedContent({
      model: "gemini-flash-latest",
      systemInstruction: "short prompt below the minimum cache size",
    });
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
