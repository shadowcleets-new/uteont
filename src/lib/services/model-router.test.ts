import { describe, it, expect, afterEach } from "vitest";
import { pickModel } from "./model-router";

const ORIGINAL = process.env.GEMINI_MODEL_DIRECTOR;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.GEMINI_MODEL_DIRECTOR;
  else process.env.GEMINI_MODEL_DIRECTOR = ORIGINAL;
});

describe("model router", () => {
  it("defaults director to gemini-flash-latest", () => {
    delete process.env.GEMINI_MODEL_DIRECTOR;
    expect(pickModel("director")).toBe("gemini-flash-latest");
    expect(pickModel("director-report")).toBe("gemini-flash-latest");
  });

  it("respects the GEMINI_MODEL_DIRECTOR override", () => {
    process.env.GEMINI_MODEL_DIRECTOR = "gemini-2.5-flash-lite";
    expect(pickModel("director")).toBe("gemini-2.5-flash-lite");
  });

  it("ignores a blank override", () => {
    process.env.GEMINI_MODEL_DIRECTOR = "   ";
    expect(pickModel("director")).toBe("gemini-flash-latest");
  });
});
