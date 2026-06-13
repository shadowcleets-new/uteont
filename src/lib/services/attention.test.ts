import { describe, it, expect } from "vitest";
import { attentionSeverity, summarizeAttention } from "./attention";

describe("attentionSeverity (LO-21)", () => {
  it("ranks a high-blast pending checkpoint as critical", () => {
    expect(attentionSeverity({ kind: "checkpoint", status: "pending", blastRadius: 12 })).toBe("critical");
  });
  it("ranks a low-blast pending checkpoint as attention", () => {
    expect(attentionSeverity({ kind: "checkpoint", status: "pending", blastRadius: 1 })).toBe("attention");
  });
  it("ranks a failed run as attention", () => {
    expect(attentionSeverity({ kind: "run", status: "failure" })).toBe("attention");
  });
  it("ranks a successful run as info (quiet by default)", () => {
    expect(attentionSeverity({ kind: "run", status: "success" })).toBe("info");
  });
});

describe("summarizeAttention (LO-21 quiet-by-default)", () => {
  it("separates what needs you from what's just done", () => {
    const s = summarizeAttention({
      checkpoints: [
        { status: "pending", blastRadius: 12 },
        { status: "pending", blastRadius: 1 },
        { status: "approved", blastRadius: 1 },
      ],
      runs: [
        { status: "success" },
        { status: "success" },
        { status: "failure" },
      ],
    });
    expect(s.needsYou).toBe(3); // 2 pending checkpoints + 1 failed run
    expect(s.critical).toBe(1); // the high-blast pending checkpoint
    expect(s.done).toBe(2); // 2 successful runs
  });

  it("is calm when nothing needs attention", () => {
    const s = summarizeAttention({ checkpoints: [], runs: [{ status: "success" }] });
    expect(s.needsYou).toBe(0);
    expect(s.critical).toBe(0);
    expect(s.done).toBe(1);
  });
});
