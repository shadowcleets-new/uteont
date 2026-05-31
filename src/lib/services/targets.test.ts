import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, articles, targets, runs } from "@/lib/db/schema";
import { createSite } from "./sites";
import {
  createTarget, listTargets, getTarget, updateTarget, deleteTarget,
  computeCurrentValue, getTargetWithProgress, TargetNotFoundError,
} from "./targets";

const rand = () => Math.random().toString(36).slice(2, 8);
const DAY = 86_400_000;

describe("targets service (live DB)", () => {
  it("CRUD + manual & computed metrics + progress", { timeout: 25000 }, async () => {
    const db = getDb();
    const site = await createSite({
      key: `tgt-${rand()}`, name: "T", domain: "https://t.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const startAt = new Date(Date.now() - 50 * DAY);
    const deadlineAt = new Date(Date.now() + 50 * DAY);
    try {
      // manual metric -> uses manualCurrent
      const t = await createTarget({
        siteId: site.id, title: "Manual goal", metric: "manual",
        baselineValue: 0, goalValue: 100, manualCurrent: 40, startAt, deadlineAt,
      });
      expect(t.id).toBeGreaterThan(0);
      expect(await computeCurrentValue(t)).toBe(40);

      const wp = await getTargetWithProgress(t, Date.now());
      expect(wp.current).toBe(40);
      expect(wp.progress.progressPct).toBeCloseTo(40, 4);

      // computed metric -> counts published articles
      await db.insert(articles).values({
        siteId: site.id, title: "A", slug: `a-${rand()}`, body: "b", status: "published",
      });
      const t2 = await createTarget({
        siteId: site.id, title: "Publish goal", metric: "articles_published",
        baselineValue: 0, goalValue: 10, startAt, deadlineAt,
      });
      expect(await computeCurrentValue(t2)).toBe(1);

      // list freshest-first
      const list = await listTargets(site.id);
      expect(list.length).toBe(2);
      expect(list[0].id).toBe(t2.id);

      // update + get
      const upd = await updateTarget(t.id, { goalValue: 200 });
      expect(upd.goalValue).toBe(200);
      expect((await getTarget(t.id))?.goalValue).toBe(200);

      // delete
      await deleteTarget(t2.id);
      expect(await getTarget(t2.id)).toBeNull();

      // missing -> typed error
      await expect(updateTarget(999_999_999, { title: "x" })).rejects.toBeInstanceOf(TargetNotFoundError);
    } finally {
      await db.delete(targets).where(eq(targets.siteId, site.id));
      await db.delete(articles).where(eq(articles.siteId, site.id));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });

  it("technical_seo_score metric reads the newest successful audit score", { timeout: 25000 }, async () => {
    const db = getDb();
    const site = await createSite({
      key: `tgt-${rand()}`, name: "T", domain: "https://t.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const startAt = new Date(Date.now() - 50 * DAY);
    const deadlineAt = new Date(Date.now() + 50 * DAY);
    try {
      const target = await createTarget({
        siteId: site.id, title: "Tech SEO >= 90", metric: "technical_seo_score",
        baselineValue: 50, goalValue: 90, startAt, deadlineAt,
      });
      // No audit yet -> 0 (nothing to read).
      expect(await computeCurrentValue(target)).toBe(0);

      // Two successful audits; the newest (higher id) wins.
      await db.insert(runs).values({
        subjectKey: "agent.technical-seo", category: "agent", action: "technical-seo",
        siteId: site.id, status: "success", result: { score: 72 },
      });
      await db.insert(runs).values({
        subjectKey: "agent.technical-seo", category: "agent", action: "technical-seo",
        siteId: site.id, status: "success", result: { score: 85 },
      });
      // A failed run with a higher score must be ignored.
      await db.insert(runs).values({
        subjectKey: "agent.technical-seo", category: "agent", action: "technical-seo",
        siteId: site.id, status: "failure", result: { score: 99 },
      });
      expect(await computeCurrentValue(target)).toBe(85);
    } finally {
      await db.delete(runs).where(eq(runs.siteId, site.id));
      await db.delete(targets).where(eq(targets.siteId, site.id));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });
});
