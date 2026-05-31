import { describe, it, expect } from "vitest";
import { pickNextAction, type RankableTarget } from "./next-action";
import type { TargetProgress } from "./target-progress";

interface Over {
  id?: number;
  title?: string;
  metric?: string;
  status?: string;
  progress?: Partial<RankableTarget["progress"]>;
}

const t = (over: Over = {}): RankableTarget => ({
  id: over.id ?? 1,
  title: over.title ?? "Goal",
  metric: over.metric ?? "technical_seo_score",
  status: over.status ?? "active",
  progress: {
    status: (over.progress?.status ?? "on-track") as TargetProgress["status"],
    progressPct: over.progress?.progressPct ?? 50,
    daysRemaining: over.progress?.daysRemaining ?? 30,
  },
});

describe("pickNextAction", () => {
  it("returns null when there are no active, unmet targets", () => {
    expect(pickNextAction([])).toBeNull();
    expect(pickNextAction([t({ status: "archived", progress: { status: "off-track" } })])).toBeNull();
    expect(pickNextAction([t({ progress: { status: "hit" } })])).toBeNull();
  });

  it("prioritizes the worst trajectory status", () => {
    const a = pickNextAction([
      t({ id: 1, title: "On track one", progress: { status: "on-track" } }),
      t({ id: 2, title: "Off track one", progress: { status: "off-track" } }),
      t({ id: 3, title: "At risk one", progress: { status: "at-risk" } }),
    ]);
    expect(a?.targetId).toBe(2);
    expect(a?.status).toBe("off-track");
  });

  it("breaks status ties by soonest deadline", () => {
    const a = pickNextAction([
      t({ id: 1, title: "Far", progress: { status: "at-risk", daysRemaining: 40 } }),
      t({ id: 2, title: "Soon", progress: { status: "at-risk", daysRemaining: 5 } }),
    ]);
    expect(a?.targetId).toBe(2);
  });

  it("routes technical_seo_score to the technical-seo agent", () => {
    const a = pickNextAction([t({ metric: "technical_seo_score", progress: { status: "off-track" } })]);
    expect(a?.href).toBe("/agents/technical-seo");
    expect(a?.cta).toContain("Technical SEO");
    expect(a?.suggestion.toLowerCase()).toContain("score");
  });

  it("routes the manual metric to the targets page (no agent)", () => {
    const a = pickNextAction([t({ metric: "manual", progress: { status: "off-track" } })]);
    expect(a?.href).toBe("/targets");
    expect(a?.cta).toBe("Update on Targets");
  });

  it("pluralizes the day count correctly", () => {
    const one = pickNextAction([t({ progress: { status: "off-track", daysRemaining: 1 } })]);
    expect(one?.suggestion).toContain("1 day left");
    const many = pickNextAction([t({ progress: { status: "off-track", daysRemaining: 12 } })]);
    expect(many?.suggestion).toContain("12 days left");
  });
});
