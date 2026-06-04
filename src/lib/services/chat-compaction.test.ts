import { describe, it, expect } from "vitest";
import { planCompaction } from "./chat-compaction";

describe("planCompaction", () => {
  it("does not compact below the threshold", () => {
    expect(planCompaction({ liveCount: 10 })).toEqual({ shouldCompact: false, evictCount: 0 });
    expect(planCompaction({ liveCount: 23 })).toEqual({ shouldCompact: false, evictCount: 0 });
  });

  it("compacts at/above the threshold, evicting down to keepRecent", () => {
    expect(planCompaction({ liveCount: 24 })).toEqual({ shouldCompact: true, evictCount: 12 });
    expect(planCompaction({ liveCount: 30 })).toEqual({ shouldCompact: true, evictCount: 18 });
  });

  it("respects custom keepRecent / compactAt", () => {
    expect(planCompaction({ liveCount: 8, keepRecent: 4, compactAt: 8 })).toEqual({ shouldCompact: true, evictCount: 4 });
    expect(planCompaction({ liveCount: 7, keepRecent: 4, compactAt: 8 })).toEqual({ shouldCompact: false, evictCount: 0 });
  });
});
