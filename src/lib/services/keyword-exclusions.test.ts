import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db/client";
import { sites, keywords, keywordExclusions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

import {
  addExclusion,
  listExclusions,
  removeExclusion,
  removeExclusionByPhrase,
  extractHeadPhrase,
} from "./keyword-exclusions";
import { createSite } from "./sites";
import { updateKeyword, bulkUpdateKeywords } from "./keywords";

let db: ReturnType<typeof getDb>;

const fixtureKey = () => `test-${Math.random().toString(36).slice(2, 8)}`;

async function makeSite() {
  return createSite({
    key: fixtureKey(),
    name: "Exclusions Test",
    domain: "https://exclusions-test.invalid",
    locale: "en-US",
    cmsPlatform: "none",
    contentPillars: [],
    bannedPhrases: [],
    defaultCategories: [],
  });
}

async function makeKeyword(siteId: number, phrase: string) {
  const [row] = await db
    .insert(keywords)
    .values({
      siteId,
      keyword: phrase,
      searchVolumeEstimate: 100,
      competitionScore: 0.4,
      source: "test",
      priorityRank: 1,
      status: "researched",
    })
    .returning();
  return row;
}

/**
 * keywords.site_id has no ON DELETE CASCADE (unlike keyword_exclusions),
 * so fixture keywords must go before their site.
 */
async function cleanupSite(siteId: number) {
  await db.delete(keywords).where(eq(keywords.siteId, siteId));
  await db.delete(sites).where(eq(sites.id, siteId));
}

describe("keyword-exclusions service", () => {
  beforeEach(() => {
    db = getDb();
  });

  it("persists a trimmed phrase and returns the row", { timeout: 15000 }, async () => {
    const site = await makeSite();
    const row = await addExclusion({
      siteId: site.id,
      phrase: "  credit card rewards  ",
      reason: "client rejected",
    });
    expect(row.id).toBeGreaterThan(0);
    expect(row.phrase).toBe("credit card rewards");
    expect(row.reason).toBe("client rejected");
    expect(row.source).toBe("keyword");
    await cleanupSite(site.id);
  });

  it("dedups case variants idempotently (returns the existing row)", { timeout: 15000 }, async () => {
    const site = await makeSite();
    const first = await addExclusion({ siteId: site.id, phrase: "Credit Card Rewards" });
    const second = await addExclusion({ siteId: site.id, phrase: "credit card rewards" });
    expect(second.id).toBe(first.id);
    const all = await listExclusions(site.id);
    expect(all.length).toBe(1);
    await cleanupSite(site.id);
  });

  it("throws on an empty phrase", { timeout: 15000 }, async () => {
    const site = await makeSite();
    await expect(addExclusion({ siteId: site.id, phrase: "   " })).rejects.toThrow(/empty/i);
    await cleanupSite(site.id);
  });

  it("lists newest-first, scoped to the site", { timeout: 15000 }, async () => {
    const siteA = await makeSite();
    const siteB = await makeSite();
    await addExclusion({ siteId: siteA.id, phrase: "alpha one" });
    await addExclusion({ siteId: siteA.id, phrase: "alpha two" });
    await addExclusion({ siteId: siteB.id, phrase: "beta only" });
    const a = await listExclusions(siteA.id);
    expect(a.map((r) => r.phrase)).toEqual(["alpha two", "alpha one"]);
    const b = await listExclusions(siteB.id);
    expect(b.map((r) => r.phrase)).toEqual(["beta only"]);
    await cleanupSite(siteA.id);
    await cleanupSite(siteB.id);
  });

  it("removes by id and by (siteId, phrase) case-insensitively", { timeout: 15000 }, async () => {
    const site = await makeSite();
    const a = await addExclusion({ siteId: site.id, phrase: "remove me" });
    await removeExclusion(a.id);
    expect(await listExclusions(site.id)).toEqual([]);

    await addExclusion({ siteId: site.id, phrase: "Remove By Phrase" });
    await removeExclusionByPhrase(site.id, "remove by phrase");
    expect(await listExclusions(site.id)).toEqual([]);
    await cleanupSite(site.id);
  });
});

describe("closed loop: shelve captures, restore releases", () => {
  beforeEach(() => {
    db = getDb();
  });

  it("shelving a keyword captures an exclusion with the keyword's phrase", { timeout: 15000 }, async () => {
    const site = await makeSite();
    const kw = await makeKeyword(site.id, "shelve capture phrase");
    await updateKeyword(kw.id, { status: "shelved", shelvedReason: "off-topic" });
    const rows = await listExclusions(site.id);
    expect(rows.map((r) => r.phrase)).toEqual(["shelve capture phrase"]);
    expect(rows[0].reason).toBe("off-topic");
    expect(rows[0].source).toBe("keyword");
    expect(rows[0].sourceId).toBe(kw.id);
    await cleanupSite(site.id);
  });

  it("restoring a shelved keyword releases its exclusion", { timeout: 15000 }, async () => {
    const site = await makeSite();
    const kw = await makeKeyword(site.id, "restore release phrase");
    await updateKeyword(kw.id, { status: "shelved" });
    expect((await listExclusions(site.id)).length).toBe(1);
    await updateKeyword(kw.id, { status: "researched" });
    expect(await listExclusions(site.id)).toEqual([]);
    await cleanupSite(site.id);
  });

  it("bulk shelve captures all phrases; bulk restore releases them", { timeout: 20000 }, async () => {
    const site = await makeSite();
    const k1 = await makeKeyword(site.id, "bulk phrase one");
    const k2 = await makeKeyword(site.id, "bulk phrase two");
    await bulkUpdateKeywords([k1.id, k2.id], { status: "shelved", shelvedReason: "batch" });
    const captured = await listExclusions(site.id);
    expect(captured.map((r) => r.phrase).sort()).toEqual([
      "bulk phrase one",
      "bulk phrase two",
    ]);
    await bulkUpdateKeywords([k1.id, k2.id], { status: "researched" });
    expect(await listExclusions(site.id)).toEqual([]);
    await cleanupSite(site.id);
  });

  it("approve does NOT capture an exclusion", { timeout: 15000 }, async () => {
    const site = await makeSite();
    const kw = await makeKeyword(site.id, "approved phrase");
    await updateKeyword(kw.id, { status: "approved" });
    expect(await listExclusions(site.id)).toEqual([]);
    await cleanupSite(site.id);
  });
});

describe("extractHeadPhrase", () => {
  it("returns the head before an em-dash/colon separator", () => {
    expect(
      extractHeadPhrase(
        "How sourdough starter goes dormant — a 2026 chemistry deep-dive",
      ),
    ).toBe("How sourdough starter goes dormant");
    expect(extractHeadPhrase("Best CRMs: the 2026 field guide")).toBe(
      "Best CRMs",
    );
  });

  it("caps long unseparated strings at six meaningful words", () => {
    const head = extractHeadPhrase(
      "one two three four five six seven eight nine ten",
    );
    expect(head).toBe("one two three four five six");
  });

  it("handles empty input", () => {
    expect(extractHeadPhrase("")).toBe("");
  });
});

// keywordExclusions is imported so schema compilation is exercised even
// when the table type is the only thing a regression touches.
void keywordExclusions;
