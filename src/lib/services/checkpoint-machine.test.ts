import { describe, it, expect } from "vitest";
import {
  VERBS,
  isTerminal,
  canDecide,
  applyVerb,
  frictionFor,
  toApprovalDecision,
  canUndo,
  UNDO_WINDOW_MS,
} from "./checkpoint-machine";

describe("checkpoint machine", () => {
  it("has the five decision verbs", () => {
    expect(VERBS).toEqual(["approve", "reject", "edit", "defer", "escalate"]);
  });

  it("transitions pending via each verb", () => {
    expect(applyVerb("pending", "approve")).toBe("approved");
    expect(applyVerb("pending", "reject")).toBe("rejected");
    expect(applyVerb("pending", "edit")).toBe("edited");
    expect(applyVerb("pending", "defer")).toBe("deferred");
    expect(applyVerb("pending", "escalate")).toBe("escalated");
  });

  it("treats approve/reject/edit as terminal but keeps defer/escalate open", () => {
    expect(isTerminal("approved")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("edited")).toBe(true);
    expect(isTerminal("deferred")).toBe(false);
    expect(isTerminal("escalated")).toBe(false);
    expect(canDecide("deferred")).toBe(true);
    expect(canDecide("approved")).toBe(false);
  });

  it("refuses to re-decide a terminal checkpoint", () => {
    expect(() => applyVerb("approved", "reject")).toThrow();
  });

  it("escalates friction with blast radius", () => {
    expect(frictionFor(0)).toBe("none");
    expect(frictionFor(1)).toBe("none");
    expect(frictionFor(2)).toBe("confirm");
    expect(frictionFor(9)).toBe("confirm");
    expect(frictionFor(10)).toBe("type-to-confirm");
    expect(frictionFor(50)).toBe("type-to-confirm");
  });

  it("maps verbs to the audit-log decision vocabulary", () => {
    expect(toApprovalDecision("approve")).toBe("approve");
    expect(toApprovalDecision("edit")).toBe("edit");
    expect(toApprovalDecision("reject")).toBe("reject");
  });

  describe("canUndo (LO-18)", () => {
    const now = 1_000_000_000_000;
    it("allows undo of a terminal decision inside the window", () => {
      expect(canUndo("approved", new Date(now - 60_000), now)).toBe(true);
      expect(canUndo("rejected", new Date(now - (UNDO_WINDOW_MS - 1)), now)).toBe(true);
    });
    it("refuses undo after the window expires", () => {
      expect(canUndo("approved", new Date(now - (UNDO_WINDOW_MS + 1)), now)).toBe(false);
    });
    it("refuses undo of a non-terminal (still-open) checkpoint", () => {
      expect(canUndo("pending", new Date(now), now)).toBe(false);
      expect(canUndo("deferred", new Date(now), now)).toBe(false);
    });
    it("refuses undo with no decidedAt", () => {
      expect(canUndo("approved", null, now)).toBe(false);
    });
  });
});
