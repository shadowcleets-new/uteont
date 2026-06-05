import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, runs, type Site } from "@/lib/db/schema";
import type { SiteCreateInput, SiteUpdateInput } from "@/lib/validation/site";

/**
 * Surfaced when a site `key` is already taken. The route layer maps this
 * to a 409 Conflict; the service layer never logs-and-returns-undefined.
 */
export class SiteKeyTakenError extends Error {
  constructor(key: string) {
    super(`Site key already in use: ${key}`);
    this.name = "SiteKeyTakenError";
  }
}

/**
 * Surfaced when the caller tries to delete a site that still has agent
 * runs in flight. The DELETE handler returns 400 with a clear hint.
 */
export class SiteHasActiveRunsError extends Error {
  readonly runIds: number[];
  constructor(runIds: number[]) {
    super(
      `Cannot delete a site with ${runIds.length} active agent run${
        runIds.length === 1 ? "" : "s"
      } in flight.`,
    );
    this.name = "SiteHasActiveRunsError";
    this.runIds = runIds;
  }
}

export async function createSite(input: SiteCreateInput): Promise<Site> {
  const db = getDb();
  try {
    const [row] = await db
      .insert(sites)
      .values({
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
      })
      .returning();
    return row;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/sites_key_unique_idx|duplicate key value/i.test(msg)) {
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
    return db.select().from(sites);
  }
  return db.select().from(sites).where(ne(sites.status, "archived"));
}

export async function updateSite(
  id: number,
  input: SiteUpdateInput,
): Promise<Site> {
  const db = getDb();
  const [row] = await db
    .update(sites)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(sites.id, id))
    .returning();
  return row;
}

/**
 * Hard-deletes the site and — via ON DELETE CASCADE on every per-site
 * FK — every cycle/run/job/keyword/idea/article/approval/conversation/
 * keyword_exclusion/site_integration rooted at it. Refuses to act if any
 * agent run is currently in flight: killing those mid-execution would
 * leave the Python worker holding orphaned jobs.
 *
 * Cloud-storage purge for cached media is the responsibility of a future
 * spec; this layer only removes DB state and reports completion.
 */
export async function deleteSiteCascading(id: number): Promise<void> {
  const db = getDb();
  const activeRuns = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.siteId, id), eq(runs.status, "running")));
  if (activeRuns.length > 0) {
    throw new SiteHasActiveRunsError(activeRuns.map((r) => r.id));
  }
  await db.delete(sites).where(eq(sites.id, id));
}

/** Soft-archive — leaves data intact but hides from default lists. */
export async function archiveSite(id: number): Promise<Site> {
  const db = getDb();
  const [row] = await db
    .update(sites)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(sites.id, id))
    .returning();
  return row;
}

/** Used by /api/sites/list to attach integration counts without N+1. */
export async function getSiteIntegrationCounts(
  siteIds: number[],
): Promise<Map<number, number>> {
  if (siteIds.length === 0) return new Map();
  const db = getDb();
  const { siteIntegrations } = await import("@/lib/db/schema");
  const { count } = await import("drizzle-orm");
  const rows = await db
    .select({ siteId: siteIntegrations.siteId, n: count(siteIntegrations.id) })
    .from(siteIntegrations)
    .where(inArray(siteIntegrations.siteId, siteIds))
    .groupBy(siteIntegrations.siteId);
  return new Map(rows.map((r) => [r.siteId, Number(r.n)]));
}
