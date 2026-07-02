import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db/client";
import { ideas, sites } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createSite } from "./sites";
import { persistIdeas } from "./jobs";

describe("persistIdeas stamps siteId", () => {
  it("sets site_id on new ideas", { timeout: 20000 }, async () => {
    const site = await createSite({
      key: `test-${Math.random().toString(36).slice(2, 8)}`,
      name: "PersistIdeas T", domain: "https://t.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    try {
      await persistIdeas(site.id, null, {
        ideas: [{ keyword: "k-test", angle: "an angle", brief: "a brief" }],
      });
      const [row] = await getDb()
        .select().from(ideas)
        .where(eq(ideas.siteId, site.id))
        .orderBy(desc(ideas.id)).limit(1);
      expect(row?.siteId).toBe(site.id);
      expect(row?.angle).toBe("an angle");
    } finally {
      await getDb().delete(ideas).where(eq(ideas.siteId, site.id));
      await getDb().delete(sites).where(eq(sites.id, site.id));
    }
  });
});
