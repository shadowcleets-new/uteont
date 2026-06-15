import { describe, it, expect } from "vitest";
import {
  withinCooldown,
  inHoldout,
  expectedCtr,
  evaluateTriggers,
  type SeriesPoint,
  type Trigger,
} from "./reoptimization-triggers";

// #region Helpers
/** Build a chronological series of `n` days starting 2025-01-01 with per-index field values. */
function series(values: Array<Partial<Omit<SeriesPoint, "day">>>): SeriesPoint[] {
  const start = new Date("2025-01-01T00:00:00Z");
  return values.map((v, i) => {
    const d = new Date(start.getTime() + i * 86_400_000);
    return { day: d.toISOString().slice(0, 10), ...v };
  });
}

const kinds = (ts: Trigger[]) => ts.map((t) => t.kind);
// #endregion

// #region SLIP
describe("evaluateTriggers — SLIP", () => {
  it("fires SLIP when recent-7 median position is >= 3 worse than prior-7", () => {
    // prior 7 around position 4, recent 7 around position 9 -> delta +5 >= 3.
    const prior = Array.from({ length: 7 }, () => ({ position: 4 }));
    const recent = Array.from({ length: 7 }, () => ({ position: 9 }));
    const ts = evaluateTriggers(series([...prior, ...recent]));
    expect(kinds(ts)).toContain("SLIP");
  });

  it("does not fire SLIP when the change is < 3", () => {
    const prior = Array.from({ length: 7 }, () => ({ position: 4 }));
    const recent = Array.from({ length: 7 }, () => ({ position: 5 })); // delta +1
    const ts = evaluateTriggers(series([...prior, ...recent]));
    expect(kinds(ts)).not.toContain("SLIP");
  });
});
// #endregion

// #region CTR_GAP
describe("evaluateTriggers — CTR_GAP", () => {
  it("fires CTR_GAP when latest ctr is well below half of expectedCtr(position)", () => {
    // position 1 -> expected ~0.30; ctr 0.05 < 0.15 (half).
    const pts = series([
      ...Array.from({ length: 7 }, () => ({ position: 1, ctr: 0.3 })),
      ...Array.from({ length: 6 }, () => ({ position: 1, ctr: 0.3 })),
      { position: 1, ctr: 0.05 },
    ]);
    const ts = evaluateTriggers(pts);
    expect(kinds(ts)).toContain("CTR_GAP");
  });

  it("does not fire CTR_GAP when ctr is healthy", () => {
    const pts = series([
      ...Array.from({ length: 13 }, () => ({ position: 1, ctr: 0.3 })),
      { position: 1, ctr: 0.3 },
    ]);
    const ts = evaluateTriggers(pts);
    expect(kinds(ts)).not.toContain("CTR_GAP");
  });
});
// #endregion

// #region withinCooldown
describe("withinCooldown", () => {
  const now = new Date("2025-06-14T12:00:00Z");

  it("is true when now is before cooldownUntil", () => {
    expect(withinCooldown(new Date("2025-06-14T18:00:00Z"), now)).toBe(true);
  });

  it("is false when now is after cooldownUntil", () => {
    expect(withinCooldown(new Date("2025-06-14T06:00:00Z"), now)).toBe(false);
  });

  it("is false when cooldownUntil is null or undefined", () => {
    expect(withinCooldown(null, now)).toBe(false);
    expect(withinCooldown(undefined, now)).toBe(false);
  });
});
// #endregion

// #region inHoldout
describe("inHoldout", () => {
  it("is deterministic — same key yields the same result", () => {
    expect(inHoldout("page-alpha")).toBe(inHoldout("page-alpha"));
    expect(inHoldout("page-beta", 0.25)).toBe(inHoldout("page-beta", 0.25));
  });

  it("assigns roughly `fraction` of synthetic keys to the holdout", () => {
    let hits = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (inHoldout(`page-key-${i}`)) hits++;
    }
    const share = hits / total;
    expect(share).toBeGreaterThanOrEqual(0.05);
    expect(share).toBeLessThanOrEqual(0.15);
  });
});
// #endregion

// #region expectedCtr
describe("expectedCtr", () => {
  it("is monotonically decreasing across positions 1, 2, 3", () => {
    const p1 = expectedCtr(1);
    const p2 = expectedCtr(2);
    const p3 = expectedCtr(3);
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p3);
  });

  it("clamps to the (0, 0.4] band", () => {
    expect(expectedCtr(1)).toBeGreaterThan(0);
    expect(expectedCtr(1)).toBeLessThanOrEqual(0.4);
    expect(expectedCtr(100)).toBeGreaterThan(0);
  });
});
// #endregion

// #region Defensive
describe("evaluateTriggers — defensive", () => {
  it("returns an empty array for too few points and never throws", () => {
    expect(evaluateTriggers([])).toEqual([]);
    expect(evaluateTriggers(series([{ position: 3 }]))).toEqual([]);
  });
});
// #endregion
