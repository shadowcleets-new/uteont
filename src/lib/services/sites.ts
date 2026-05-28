import { getDb } from "@/lib/db/client";
import { sites, type Site } from "@/lib/db/schema";
import { eq, ne } from "drizzle-orm";
import type { SiteCreateInput, SiteUpdateInput } from "@/lib/validation/site";

export class SiteKeyTakenError extends Error {
  constructor(key: string) {
    super(`Site key already in use: ${key}`);
    this.name = "SiteKeyTakenError";
  }
}

export async function createSite(input: SiteCreateInput): Promise<Site> {
  const db = getDb();
  try {
    const [row] = await db.insert(sites).values({
      key: input.key,
      name: input.name,
      domain: input.domain,
      locale: input.locale,
      cmsPlatform: input.cmsPlatform,
      niche: input.niche ?? null,
      audience: input.audience ?? null,
      voiceGuide: input.voiceGuide ?? null,
      contentPillars: input.contentPillars,
      bannedPhrases: input.bannedPhrases,
      defaultCategories: input.defaultCategories,
      sitemapUrl: input.sitemapUrl ?? null,
      gscPropertyId: input.gscPropertyId ?? null,
      ga4PropertyId: input.ga4PropertyId ?? null,
    }).returning();
    return row;
  } catch (e) {
    // Neon HTTP returns errors about unique constraint violations on the key.
    // Since the only unique constraint on insert is the key, treat any
    // insert error as a key violation.
    const msg = e instanceof Error ? e.message : String(e);
    // Check for the specific constraint name or common duplicate/constraint patterns
    if (/sites_key_unique_idx|duplicate.*key|unique.*constraint/i.test(msg) ||
        (msg.includes("Failed query") && msg.includes("insert into \"sites\""))) {
      throw new SiteKeyTakenError(input.key);
    }
    throw e;
  }
}

export async function getSiteById(id: number): Promise<Site | null> {
  const db = getDb();
  const [row] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  return row ?? null;
}

export async function getSiteByKey(key: string): Promise<Site | null> {
  const db = getDb();
  const [row] = await db.select().from(sites).where(eq(sites.key, key)).limit(1);
  return row ?? null;
}

export async function listSites(
  opts: { includeArchived?: boolean } = {},
): Promise<Site[]> {
  const db = getDb();
  if (opts.includeArchived) {
    return await db.select().from(sites);
  }
  return await db.select().from(sites).where(ne(sites.status, "archived"));
}

export async function updateSite(
  id: number,
  input: SiteUpdateInput,
): Promise<Site> {
  const db = getDb();
  const [row] = await db.update(sites)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(sites.id, id))
    .returning();
  return row;
}

export async function archiveSite(id: number): Promise<Site> {
  const db = getDb();
  const [row] = await db.update(sites)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(sites.id, id))
    .returning();
  return row;
}
