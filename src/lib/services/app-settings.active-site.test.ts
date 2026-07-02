import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getActiveSiteId, setActiveSiteId, ACTIVE_SITE_KEY } from "./app-settings";

// These run against the live DB and the active-site setting is a singleton row,
// so snapshot the operator's real selection and restore it afterwards.
let original: unknown;

describe("getActiveSiteId", () => {
  beforeAll(async () => {
    const [row] = await getDb()
      .select({ value: kvSettings.value })
      .from(kvSettings)
      .where(eq(kvSettings.key, ACTIVE_SITE_KEY))
      .limit(1);
    original = row ? row.value : undefined;
  });

  afterAll(async () => {
    const db = getDb();
    if (original === undefined) {
      await db.delete(kvSettings).where(eq(kvSettings.key, ACTIVE_SITE_KEY));
    } else {
      await db
        .insert(kvSettings)
        .values({ key: ACTIVE_SITE_KEY, value: original })
        .onConflictDoUpdate({ target: kvSettings.key, set: { value: original, updatedAt: new Date() } });
    }
  });

  it("returns null when unset", async () => {
    await getDb().delete(kvSettings).where(eq(kvSettings.key, ACTIVE_SITE_KEY));
    expect(await getActiveSiteId()).toBeNull();
  });

  it("round-trips a set id", async () => {
    await setActiveSiteId(4242);
    expect(await getActiveSiteId()).toBe(4242);
  });

  it("returns null (not a crash) when the stored shape is unexpected", async () => {
    await getDb()
      .insert(kvSettings)
      .values({ key: ACTIVE_SITE_KEY, value: { nope: true } })
      .onConflictDoUpdate({ target: kvSettings.key, set: { value: { nope: true }, updatedAt: new Date() } });
    expect(await getActiveSiteId()).toBeNull();
  });
});
