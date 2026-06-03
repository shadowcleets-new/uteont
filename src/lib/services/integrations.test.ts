import { describe, it, expect, beforeAll, afterEach, beforeEach } from "vitest";
import { getDb } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSite } from "./sites";
import {
  createIntegration, getIntegration, listIntegrations,
  updateIntegration, deleteIntegration,
} from "./integrations";

const db = getDb();

describe("integrations service", () => {
  let siteId: number;

  beforeAll(() => {
    process.env.CONNECTION_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  beforeEach(async () => {
    const key = `t-${Math.random().toString(36).slice(2, 8)}`;
    const s = await createSite({
      key, name: "Fixture", domain: "https://f.com", locale: "en-US",
      cmsPlatform: "wordpress",
      contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    siteId = s.id;
  });

  afterEach(async () => {
    // Clean up this test's site and all its integrations (cascade delete)
    if (siteId) {
      await db.delete(sites).where(eq(sites.id, siteId));
    }
  });

  it("encrypts config on create — ciphertext never contains plaintext", async () => {
    const row = await createIntegration(siteId, {
      kind: "wordpress",
      label: "Main",
      config: { baseUrl: "https://wp.f.com", token: "supersecret-xyz" },
    });
    expect(row.id).toBeGreaterThan(0);
    expect(JSON.stringify(row)).not.toContain("supersecret-xyz");
    expect(JSON.stringify(row)).not.toContain("https://wp.f.com");
  });

  it("getIntegration returns plaintext config when explicitly requested", async () => {
    const row = await createIntegration(siteId, {
      kind: "wordpress",
      config: { token: "abc-123" },
    });
    const fetched = await getIntegration(row.id, { decrypt: true });
    expect(fetched && "configPlain" in fetched ? fetched.configPlain : null).toEqual({ token: "abc-123" });
  });

  it("listIntegrations never returns plaintext", async () => {
    await createIntegration(siteId, {
      kind: "wordpress",
      config: { token: "should-not-appear" },
    });
    const rows = await listIntegrations(siteId);
    for (const r of rows) {
      expect(JSON.stringify(r)).not.toContain("should-not-appear");
      // shape: no configPlain key
      expect(r).not.toHaveProperty("configPlain");
    }
  });

  it("updateIntegration re-encrypts config", async () => {
    const row = await createIntegration(siteId, {
      kind: "wordpress",
      config: { token: "v1" },
    });
    await updateIntegration(row.id, { config: { token: "v2" } });
    const refetched = await getIntegration(row.id, { decrypt: true });
    expect(refetched && "configPlain" in refetched ? refetched.configPlain : null).toEqual({ token: "v2" });
  });

  it("deleteIntegration removes the row", async () => {
    const row = await createIntegration(siteId, {
      kind: "slack",
      config: { webhook: "x" },
    });
    await deleteIntegration(row.id);
    expect(await getIntegration(row.id)).toBeNull();
  });
});
