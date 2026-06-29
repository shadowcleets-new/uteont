import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

import {
  createSite, getSiteById, getSiteByKey, listSites, updateSite, archiveSite, archiveSites,
  SiteNotFoundError,
} from "./sites";

let db: ReturnType<typeof getDb>;

describe("sites service", () => {
  // Each test uses a unique key so they don't collide.
  const fixtureKey = () => `test-${Math.random().toString(36).slice(2, 8)}`;

  beforeEach(() => {
    db = getDb();
  });

  it("creates a site with full profile and returns the row", { timeout: 15000 }, async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "Test", domain: "https://test.com", locale: "en-US",
      cmsPlatform: "wordpress",
      niche: "demo niche",
      contentPillars: ["recipes", "history"],
      bannedPhrases: ["delicious"],
      defaultCategories: [],
    });
    expect(row.id).toBeGreaterThan(0);
    expect(row.key).toBe(key);
    expect(row.cmsPlatform).toBe("wordpress");
    expect(row.contentPillars).toEqual(["recipes", "history"]);
    await db.delete(sites).where(eq(sites.id, row.id));
  });

  it("rejects duplicate keys with a typed error", { timeout: 15000 }, async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "A", domain: "https://a.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    await expect(createSite({
      key, name: "B", domain: "https://b.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    })).rejects.toThrow(/key.*taken|key.*already|unique|constraint/i);
    await db.delete(sites).where(eq(sites.id, row.id));
  });

  it("looks up by id and by key", { timeout: 15000 }, async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "L", domain: "https://l.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    expect((await getSiteById(row.id))?.key).toBe(key);
    expect((await getSiteByKey(key))?.id).toBe(row.id);
    expect(await getSiteByKey("nonexistent-xxx")).toBeNull();
    await db.delete(sites).where(eq(sites.id, row.id));
  });

  it("updates profile fields", { timeout: 15000 }, async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "Old", domain: "https://o.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const updated = await updateSite(row.id, { name: "New", voiceGuide: "Warm" });
    expect(updated.name).toBe("New");
    expect(updated.voiceGuide).toBe("Warm");
    await db.delete(sites).where(eq(sites.id, row.id));
  });

  it("archive sets status='archived' and excludes from listSites by default", { timeout: 15000 }, async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "X", domain: "https://x.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    await archiveSite(row.id);
    const list = await listSites();
    expect(list.find((s) => s.id === row.id)).toBeUndefined();
    const listAll = await listSites({ includeArchived: true });
    expect(listAll.find((s) => s.id === row.id)?.status).toBe("archived");
    await db.delete(sites).where(eq(sites.id, row.id));
  });

  it("updateSite throws SiteNotFoundError for a missing id", async () => {
    await expect(updateSite(999_999_999, { name: "ghost" })).rejects.toBeInstanceOf(SiteNotFoundError);
  });

  it("archiveSite throws SiteNotFoundError for a missing id", async () => {
    await expect(archiveSite(999_999_999)).rejects.toBeInstanceOf(SiteNotFoundError);
  });

  it("archiveSites bulk-archives every id, ignores unknown ones, returns the count", { timeout: 15000 }, async () => {
    const mk = (name: string) => createSite({
      key: fixtureKey(), name, domain: "https://bulk.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const a = await mk("Bulk A");
    const b = await mk("Bulk B");

    const n = await archiveSites([a.id, b.id, 999_999_999]); // unknown id silently ignored
    expect(n).toBe(2);

    const list = await listSites();
    expect(list.find((s) => s.id === a.id)).toBeUndefined();
    expect(list.find((s) => s.id === b.id)).toBeUndefined();
    const all = await listSites({ includeArchived: true });
    expect(all.find((s) => s.id === a.id)?.status).toBe("archived");
    expect(all.find((s) => s.id === b.id)?.status).toBe("archived");

    await db.delete(sites).where(eq(sites.id, a.id));
    await db.delete(sites).where(eq(sites.id, b.id));
  });

  it("archiveSites is a no-op (returns 0) for an empty list", async () => {
    expect(await archiveSites([])).toBe(0);
  });
});
