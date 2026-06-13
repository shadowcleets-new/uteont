import { describe, it, expect } from "vitest";
import { computeCounterfactual } from "./counterfactuals";

const pt = (t: number, v: number) => ({ capturedAt: new Date(t).toISOString(), value: v });

describe("computeCounterfactual (LO-15 — no-intervention baseline)", () => {
  it("extrapolates the pre-intervention drift to the deadline", () => {
    // Two pre-intervention points rising +1/day; intervention at day 2; deadline day 10.
    const day = 86_400_000;
    const history = [pt(0, 10), pt(day, 11), pt(2 * day, 12), pt(5 * day, 20)];
    const cf = computeCounterfactual({
      history,
      interventions: [{ atMs: 2 * day }],
      baseline: 10,
      startMs: 0,
      deadlineMs: 10 * day,
    });
    // Pre-intervention slope = +1/day from (0,10) and (day,11). At day 10 → 20.
    expect(cf).not.toBeNull();
    expect(Math.round(cf!.valueAtDeadline)).toBe(20);
  });

  it("is flat at baseline when there is no pre-intervention drift signal", () => {
    const day = 86_400_000;
    const history = [pt(3 * day, 50)]; // only post-intervention data
    const cf = computeCounterfactual({
      history,
      interventions: [{ atMs: day }],
      baseline: 12,
      startMs: 0,
      deadlineMs: 10 * day,
    });
    expect(cf).not.toBeNull();
    expect(cf!.valueAtDeadline).toBe(12);
  });

  it("returns null when there are no interventions (nothing to counterfactual against)", () => {
    const day = 86_400_000;
    const history = [pt(0, 10), pt(day, 11)];
    expect(
      computeCounterfactual({ history, interventions: [], baseline: 10, startMs: 0, deadlineMs: 10 * day }),
    ).toBeNull();
  });
});
