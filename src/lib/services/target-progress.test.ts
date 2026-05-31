import { describe, it, expect } from "vitest";
import { computeTargetProgress } from "./target-progress";

const DAY = 86_400_000;
// A 100-day window starting at t0.
const t0 = 1_700_000_000_000;
const base = {
  startMs: t0,
  deadlineMs: t0 + 100 * DAY,
};

describe("computeTargetProgress — increase metric", () => {
  it("is 50% with on-track status when halfway to goal at half-time", () => {
    const p = computeTargetProgress({
      baseline: 100, goal: 200, current: 150, direction: "increase",
      ...base, nowMs: t0 + 50 * DAY,
    });
    expect(p.progressPct).toBeCloseTo(50, 5);
    expect(p.projectedAtDeadline).toBeCloseTo(200, 5); // pace of 1/day * 100 days
    expect(p.status).toBe("on-track");
    expect(p.daysRemaining).toBeCloseTo(50, 5);
  });

  it("reports hit when current reaches or passes the goal", () => {
    const p = computeTargetProgress({
      baseline: 100, goal: 200, current: 210, direction: "increase",
      ...base, nowMs: t0 + 40 * DAY,
    });
    expect(p.progressPct).toBeGreaterThanOrEqual(100);
    expect(p.status).toBe("hit");
  });

  it("is off-track when the projected value falls well short of goal", () => {
    const p = computeTargetProgress({
      baseline: 100, goal: 200, current: 110, direction: "increase",
      ...base, nowMs: t0 + 50 * DAY,
    });
    // pace 0.2/day -> projected 120 at day 100, far below 200
    expect(p.projectedAtDeadline).toBeCloseTo(120, 5);
    expect(p.status).toBe("off-track");
  });

  it("computes required vs actual pace per day", () => {
    const p = computeTargetProgress({
      baseline: 0, goal: 100, current: 40, direction: "increase",
      ...base, nowMs: t0 + 50 * DAY,
    });
    expect(p.requiredPerDay).toBeCloseTo(1, 5);   // 100 over 100 days
    expect(p.actualPerDay).toBeCloseTo(0.8, 5);   // 40 over 50 days
  });
});

describe("computeTargetProgress — decrease metric (e.g. avg position)", () => {
  it("treats moving toward a lower goal as positive progress", () => {
    const p = computeTargetProgress({
      baseline: 30, goal: 5, current: 20, direction: "decrease",
      ...base, nowMs: t0 + 50 * DAY,
    });
    // moved 10 of the needed 25 -> 40%
    expect(p.progressPct).toBeCloseTo(40, 5);
    expect(p.status).not.toBe("hit");
  });

  it("reports hit when position reaches the goal", () => {
    const p = computeTargetProgress({
      baseline: 30, goal: 5, current: 4, direction: "decrease",
      ...base, nowMs: t0 + 50 * DAY,
    });
    expect(p.progressPct).toBeGreaterThanOrEqual(100);
    expect(p.status).toBe("hit");
  });
});

describe("computeTargetProgress — edge cases", () => {
  it("handles day-zero (no elapsed time) without dividing by zero", () => {
    const p = computeTargetProgress({
      baseline: 100, goal: 200, current: 100, direction: "increase",
      ...base, nowMs: t0,
    });
    expect(Number.isFinite(p.actualPerDay)).toBe(true);
    expect(p.etaMs).toBeNull(); // no movement yet -> no ETA
    expect(p.progressPct).toBeCloseTo(0, 5);
  });

  it("returns a null ETA when moving away from the goal", () => {
    const p = computeTargetProgress({
      baseline: 100, goal: 200, current: 90, direction: "increase",
      ...base, nowMs: t0 + 25 * DAY,
    });
    expect(p.etaMs).toBeNull();
    expect(p.progressPct).toBeLessThanOrEqual(0);
  });

  it("projects an ETA when on pace", () => {
    const p = computeTargetProgress({
      baseline: 0, goal: 100, current: 50, direction: "increase",
      ...base, nowMs: t0 + 25 * DAY,
    });
    // pace 2/day -> 100 reached at day 50
    expect(p.etaMs).toBeCloseTo(t0 + 50 * DAY, -6);
  });
});
