import { describe, it, expect } from "vitest";
import { autonomyAllowsDispatch, isLowBlastRadius } from "./autonomy";

describe("isLowBlastRadius", () => {
  it("treats read/draft-only agents as low blast radius", () => {
    expect(isLowBlastRadius("research")).toBe(true);
    expect(isLowBlastRadius("idea-generation")).toBe(true);
    expect(isLowBlastRadius("content-brief")).toBe(true);
  });
  it("treats producing/outward agents as high blast radius", () => {
    expect(isLowBlastRadius("content-writing")).toBe(false);
    expect(isLowBlastRadius("outreach")).toBe(false);
    expect(isLowBlastRadius("publishing")).toBe(false);
  });
});

describe("autonomyAllowsDispatch (LO-20)", () => {
  it("L1 never auto-dispatches from chat (propose-only), even with approval", () => {
    expect(autonomyAllowsDispatch("L1", "research", true)).toBe(false);
    expect(autonomyAllowsDispatch("L1", "research", false)).toBe(false);
  });

  it("L2 dispatches any agent only with explicit approval", () => {
    expect(autonomyAllowsDispatch("L2", "research", true)).toBe(true);
    expect(autonomyAllowsDispatch("L2", "content-writing", true)).toBe(true);
    expect(autonomyAllowsDispatch("L2", "research", false)).toBe(false);
  });

  it("L3 auto-dispatches low-blast-radius agents, still gates high-blast on approval", () => {
    expect(autonomyAllowsDispatch("L3", "research", false)).toBe(true); // auto
    expect(autonomyAllowsDispatch("L3", "content-writing", false)).toBe(false); // needs approval
    expect(autonomyAllowsDispatch("L3", "content-writing", true)).toBe(true);
  });

  it("L4 auto-dispatches everything", () => {
    expect(autonomyAllowsDispatch("L4", "content-writing", false)).toBe(true);
    expect(autonomyAllowsDispatch("L4", "outreach", false)).toBe(true);
  });
});
