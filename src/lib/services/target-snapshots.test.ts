import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, targets, targetSnapshots } from "@/lib/db/schema";
import { createSite } from "./sites";
import { createTarget } from "./targets";
import { recordSnapshot, listSnapshots, snapshotsByTarget, captureSnapshots, SNAPSHOT_DEBOUNCE_MS } from "./target-snapshots";

const rand = () => Math.random().toString(36).slice(2, 8);
const DAY = 86_400_000;

describe("target snapshots (live DB)", () => {
  it("records, lists chronologically, groups, and debounces capture", { timeout: 25000 }, async () => {
    const db = getDb();
    const site = await createSite({
      key: `snap-${rand()}`, name: "S", domain: "https://s.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const mk = () => createTarget({
      siteId: site.id, title: "G", metric: "manual",
      baselineValue: 0, goalValue: 100, manualCurrent: 0,
      startAt: new Date(Date.now() - 10 * DAY), deadlineAt: new Date(Date.now() + 10 * DAY),
    });
    try {
      const t1 = await mk();
      const t2 = await mk();

      // explicit records come back oldest -> newest
      await recordSnapshot(t1.id, 10);
      await recordSnapshot(t1.id, 25);
      const series = await listSnapshots(t1.id);
      expect(series.map((s) => s.value)).toEqual([10, 25]);

      // capture writes when there's no recent snapshot...
      const wrote = await captureSnapshots([{ id: t2.id, value: 5 }]);
      expect(wrote).toBe(1);
      // ...and debounces a second call within the window
      const again = await captureSnapshots([{ id: t2.id, value: 9 }]);
      expect(again).toBe(0);
      // ...but writes if we pretend enough time has passed
      const later = await captureSnapshots([{ id: t2.id, value: 9 }], Date.now() + SNAPSHOT_DEBOUNCE_MS + 1000);
      expect(later).toBe(1);

      // grouped fetch keys by target
      const grouped = await snapshotsByTarget([t1.id, t2.id]);
      expect(grouped.get(t1.id)?.length).toBe(2);
      expect(grouped.get(t2.id)?.length).toBe(2);
    } finally {
      await db.delete(targetSnapshots).where(eq(targetSnapshots.targetId, 0)); // no-op guard
      await db.delete(targets).where(eq(targets.siteId, site.id)); // cascade removes snapshots
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });
});
