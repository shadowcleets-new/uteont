import { describe, it, expect } from "vitest";
import { formatTargetsForPrompt } from "./targets";
import type { TargetProgress } from "./target-progress";

const prog = (status: TargetProgress["status"], pct = 50, daysRemaining = 30): TargetProgress => ({
  progressPct: pct,
  requiredPerDay: 0.8,
  actualPerDay: 0.3,
  projectedAtDeadline: 0,
  etaMs: null,
  status,
  daysElapsed: 10,
  daysTotal: 40,
  daysRemaining,
});

describe("formatTargetsForPrompt", () => {
  it("returns empty string when there are no active targets", () => {
    expect(formatTargetsForPrompt([])).toBe("");
    expect(
      formatTargetsForPrompt([{ title: "Old", status: "archived", progress: prog("on-track") }]),
    ).toBe("");
  });

  it("summarizes active targets with status, progress and pace", () => {
    const out = formatTargetsForPrompt([
      { title: "Rank for B2B Textiles", status: "active", progress: prog("at-risk", 45, 20) },
      { title: "Publish 20 articles", status: "active", progress: prog("on-track", 60, 30) },
      { title: "Archived one", status: "archived", progress: prog("hit", 100) },
    ]);
    expect(out).toContain("ACTIVE TARGETS");
    expect(out).toContain("Rank for B2B Textiles");
    expect(out).toContain("AT-RISK");
    expect(out).toContain("45%");
    expect(out).toContain("Publish 20 articles");
    expect(out).not.toContain("Archived one");
    // guidance line steering the planner toward slipping targets
    expect(out.toLowerCase()).toContain("off-track");
  });
});
