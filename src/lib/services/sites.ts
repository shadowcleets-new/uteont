import { getDb } from "@/lib/db/client";
import { sites, type Site } from "@/lib/db/schema";
import { eq, ne } from "drizzle-orm";
import type { SiteCreateInput, SiteUpdateInput } from "@/lib/validation/site";
import { looksLikeKeyConflict } from "./site-errors";

export class SiteKeyTakenError extends Error {
  constructor(key: string) {
    super(`Site key already in use: ${key}`);
    this.name = "SiteKeyTakenError";
  }
}

export class SiteNotFoundError extends Error {
  constructor(id: number) {
    super(`Site not found: id=${id}`);
    this.name = "SiteNotFoundError";
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
    const msg = e instanceof Error ? e.message : String(e);
    // Fast path: an unambiguous uniqueness violation means the key is taken.
    if (looksLikeKeyConflict(msg)) {
      throw new SiteKeyTakenError(input.key);
    }
    // neon-http hides BOTH a real uniqueness violation AND a transient
    // connection failure behind a generic "Failed query: insert into ...".
    // Disambiguate by checking whether the key actually exists rather than
    // blaming the key for every insert failure (which mis-reported DB outages
    // to the user as "Site key already in use").
    try {
      if (await getSiteByKey(input.key)) {
        throw new SiteKeyTakenError(input.key);
      }
    } catch (lookupErr) {
      if (lookupErr instanceof SiteKeyTakenError) throw lookupErr;
      // The lookup itself failed (e.g. DB unreachable) — fall through and
      // surface the original insert error, which is the truthful cause.
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
  if (!row) throw new SiteNotFoundError(id);
  return row;
}

export async function archiveSite(id: number): Promise<Site> {
  const db = getDb();
  const [row] = await db.update(sites)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(sites.id, id))
    .returning();
  if (!row) throw new SiteNotFoundError(id);
  return row;
}
