import { describe, it, expect } from "vitest";

import {
  median,
  withinCooldown,
  inHoldout,
  expectedCtr,
  detectTriggers,
  type DayPoint,
  type TriggerKind,
} from "./reopt-triggers";

// #region Helpers
/** Build an ascending series of N days ending "today" (d-0), filling each field via fn(i). */
function series(n: number, fn: (i: number) => Omit<DayPoint, "day">): DayPoint[] {
  const out: DayPoint[] = [];
  for (let i = 0; i < n; i++) {
    // i = 0 is the oldest; i = n-1 is today (d-0).
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    out.push({ day: d, ...fn(i) });
  }
  return out;
}

const kinds = (ts: { kind: TriggerKind }[]): TriggerKind[] => ts.map((t) => t.kind);
// #endregion

describe("median", () => {
  it("handles empty, odd, and even lengths", () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2); // sorted -> [1,2,3]
    expect(median([4, 1, 3, 2])).toBe(2.5); // sorted -> [1,2,3,4]
  });

  it("ignores non-finite values defensively", () => {
    expect(median([1, NaN, 3, Infinity, 2])).toBe(2);
  });
});

describe("withinCooldown", () => {
  const now = new Date("2026-06-14T00:00:00Z");
  it("is true when cooldown ends strictly after now", () => {
    expect(withinCooldown(new Date("2026-06-15T00:00:00Z"), now)).toBe(true);
  });
  it("is false when cooldown is in the past, equal, or null/undefined", () => {
    expect(withinCooldown(new Date("2026-06-13T00:00:00Z"), now)).toBe(false);
    expect(withinCooldown(new Date("2026-06-14T00:00:00Z"), now)).toBe(false);
    expect(withinCooldown(null, now)).toBe(false);
    expect(withinCooldown(undefined, now)).toBe(false);
  });
});

describe("inHoldout", () => {
  it("is deterministic for a fixed key", () => {
    const a = inHoldout("site-42/target-7");
    const b = inHoldout("site-42/target-7");
    expect(a).toBe(b);
  });
  it("pct=1 always true, pct=0 always false", () => {
    for (const k of ["a", "b", "longer-key-xyz", "", "123"]) {
      expect(inHoldout(k, 1)).toBe(true);
      expect(inHoldout(k, 0)).toBe(false);
    }
  });
  it("default pct is 0.10 (a clearly-low-hash key stays out, but call is stable)", () => {
    const k = "stable-default-key";
    expect(inHoldout(k)).toBe(inHoldout(k, 0.1));
  });
});

describe("expectedCtr", () => {
  it("uses the table for integer positions", () => {
    expect(expectedCtr(1)).toBe(0.28);
    expect(expectedCtr(3)).toBe(0.1);
    expect(expectedCtr(10)).toBe(0.018);
  });
  it("clamps below 1 to position 1 and rounds to nearest int", () => {
    expect(expectedCtr(0)).toBe(0.28);
    expect(expectedCtr(0.4)).toBe(0.28);
    expect(expectedCtr(2.6)).toBe(0.1); // rounds to 3
  });
  it("uses 0.01 beyond position 10", () => {
    expect(expectedCtr(11)).toBe(0.01);
    expect(expectedCtr(50)).toBe(0.01);
  });
});

describe("detectTriggers — SLIP", () => {
  it("fires when rank worsens by >= 3 over the last 7 days vs the prior 7", () => {
    // 14 points: older window ~position 5, recent window ~position 10 (worse).
    const s = series(14, (i) => ({ position: i < 7 ? 5 : 10 }));
    expect(kinds(detectTriggers(s))).toContain("SLIP");
  });
  it("does not fire when rank improves (gets better)", () => {
    const s = series(14, (i) => ({ position: i < 7 ? 10 : 5 }));
    expect(kinds(detectTriggers(s))).not.toContain("SLIP");
  });
});

describe("detectTriggers — flat/healthy", () => {
  it("fires nothing for a stable, healthy series", () => {
    const s = series(60, () => ({ position: 4, impressions: 1000, ctr: 0.2 }));
    expect(detectTriggers(s)).toHaveLength(0);
  });
});

describe("detectTriggers — DECAY", () => {
  it("fires when impressions decay >=30% at a flat rank", () => {
    // 56 points. Prior 28 impressions ~1000, recent 28 ~600 (<= 0.7*prior). Rank flat at 4.
    const s = series(56, (i) => ({
      position: 4,
      impressions: i < 28 ? 1000 : 600,
    }));
    expect(kinds(detectTriggers(s))).toContain("DECAY");
  });
  it("does not fire when rank also moved a lot", () => {
    const s = series(56, (i) => ({
      position: i < 28 ? 4 : 12, // rank moved by 8 -> not flat
      impressions: i < 28 ? 1000 : 600,
    }));
    expect(kinds(detectTriggers(s))).not.toContain("DECAY");
  });
});

describe("detectTriggers — PLATEAU", () => {
  it("fires when stuck on page 2 (positions 11-20) and flat", () => {
    const s = series(60, () => ({ position: 15, impressions: 200 }));
    expect(kinds(detectTriggers(s))).toContain("PLATEAU");
  });
  it("does not fire when on page 1", () => {
    const s = series(60, () => ({ position: 5, impressions: 200 }));
    expect(kinds(detectTriggers(s))).not.toContain("PLATEAU");
  });
});

describe("detectTriggers — CTR_GAP", () => {
  it("fires when the last point's ctr is below half the expected ctr", () => {
    // position 1 -> expected 0.28; ctr 0.10 < 0.14 -> fire.
    const s = series(3, (i) => ({ position: 1, ctr: i === 2 ? 0.1 : 0.28 }));
    expect(kinds(detectTriggers(s))).toContain("CTR_GAP");
  });
  it("does not fire when ctr is healthy for the position", () => {
    const s = series(3, () => ({ position: 1, ctr: 0.3 }));
    expect(kinds(detectTriggers(s))).not.toContain("CTR_GAP");
  });
});

describe("detectTriggers — defensive", () => {
  it("returns [] for empty / undefined / too-short input", () => {
    expect(detectTriggers([])).toEqual([]);
    // @ts-expect-error intentionally bad input
    expect(detectTriggers(undefined)).toEqual([]);
    expect(detectTriggers([{ day: "2026-06-14", position: 5 }])).toEqual([]);
  });
});
