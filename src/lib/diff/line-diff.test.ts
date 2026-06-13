import { describe, it, expect } from "vitest";
import { computeLineDiff } from "./line-diff";

describe("computeLineDiff (LO-17)", () => {
  it("marks unchanged lines as context", () => {
    const d = computeLineDiff("a\nb", "a\nb");
    expect(d.every((l) => l.kind === "context")).toBe(true);
    expect(d).toHaveLength(2);
  });

  it("marks an added line", () => {
    const d = computeLineDiff("a", "a\nb");
    expect(d.find((l) => l.text === "b")?.kind).toBe("add");
  });

  it("marks a removed line", () => {
    const d = computeLineDiff("a\nb", "a");
    expect(d.find((l) => l.text === "b")?.kind).toBe("remove");
  });

  it("represents a changed line as a remove + an add", () => {
    const d = computeLineDiff("hello world", "hello there");
    const kinds = d.map((l) => l.kind);
    expect(kinds).toContain("remove");
    expect(kinds).toContain("add");
  });

  it("handles an empty before (all additions)", () => {
    const d = computeLineDiff("", "x\ny");
    expect(d.filter((l) => l.kind === "add")).toHaveLength(2);
  });
});
