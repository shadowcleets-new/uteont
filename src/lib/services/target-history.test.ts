import { describe, it, expect } from "vitest";
import { summarizeTrend, sparkPath, projectionConfidence } from "./target-history";

const DAY = 86_400_000;
const base = 1_700_000_000_000;
const at = (d: number, value: number) => ({ value, capturedAt: base + d * DAY });

describe("summarizeTrend", () => {
  it("needs two points before it reports a trend", () => {
    expect(summarizeTrend([]).enough).toBe(false);
    const one = summarizeTrend([at(0, 42)]);
    expect(one.enough).toBe(false);
    expect(one.direction).toBe("flat");
    expect(one.last).toBe(42);
  });

  it("reads a rising series as up with a positive per-day pace", () => {
    const s = summarizeTrend([at(0, 50), at(2, 60), at(4, 70)]);
    expect(s.enough).toBe(true);
    expect(s.direction).toBe("up");
    expect(s.delta).toBe(20);
    expect(s.perDay).toBeCloseTo(5, 6); // 20 over 4 days
    expect(s.plateau).toBe(false);
  });

  it("reads a falling series as down", () => {
    const s = summarizeTrend([at(0, 70), at(3, 55)]);
    expect(s.direction).toBe("down");
    expect(s.delta).toBe(-15);
  });

  it("flags a plateau when the last three observations are flat", () => {
    const s = summarizeTrend([at(0, 40), at(1, 80), at(2, 80), at(3, 80)]);
    expect(s.direction).toBe("up"); // overall still up from 40 -> 80
    expect(s.plateau).toBe(true); // but the tail is stalled
  });

  it("sorts unordered input by time", () => {
    const s = summarizeTrend([at(4, 70), at(0, 50), at(2, 60)]);
    expect(s.first).toBe(50);
    expect(s.last).toBe(70);
  });
});

describe("sparkPath", () => {
  it("returns empty for no data", () => {
    expect(sparkPath([])).toBe("");
  });

  it("draws a flat mid-line for a single point", () => {
    expect(sparkPath([5], 100, 20)).toBe("M0.0,10.0 L100.0,10.0");
  });

  it("maps min to the bottom and max to the top", () => {
    const d = sparkPath([0, 10], 100, 20); // pad=1, usableH=18
    expect(d.startsWith("M0.0,19.0")).toBe(true); // first (min) at bottom
    expect(d).toContain("100.0,1.0"); // last (max) at top
  });

  it("emits one point per value", () => {
    const d = sparkPath([1, 2, 3, 4], 90, 30);
    expect(d.split("L").length).toBe(4); // M + 3 L segments
  });
});

describe("projectionConfidence", () => {
  it("is low with fewer than three observations", () => {
    expect(projectionConfidence([]).level).toBe("low");
    expect(projectionConfidence([at(0, 10), at(1, 20)]).level).toBe("low");
  });

  it("is high for many steady observations", () => {
    const steady = [at(0, 10), at(1, 20), at(2, 30), at(3, 40), at(4, 50), at(5, 60)];
    const c = projectionConfidence(steady);
    expect(c.level).toBe("high");
    expect(c.samples).toBe(6);
    expect(c.paceStdDev).toBeCloseTo(0, 5); // perfectly steady pace
  });

  it("drops confidence when the pace is erratic", () => {
    const erratic = [at(0, 10), at(1, 60), at(2, 12), at(3, 80), at(4, 15)];
    const c = projectionConfidence(erratic);
    expect(c.level).not.toBe("high");
    expect(c.paceStdDev).toBeGreaterThan(0);
  });
});
