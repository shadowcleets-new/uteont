import { getDb } from "@/lib/db/client";
import { siteIntegrations, type SiteIntegration } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto/integration-secrets";
import type {
  IntegrationCreateInput, IntegrationUpdateInput,
} from "@/lib/validation/site";

export type IntegrationListItem = Omit<SiteIntegration, "config" | "configIv" | "configTag">;
export type IntegrationWithPlain = SiteIntegration & { configPlain: Record<string, unknown> };

export class IntegrationNotFoundError extends Error {
  constructor(id: number) {
    super(`Integration not found: id=${id}`);
    this.name = "IntegrationNotFoundError";
  }
}

function toListItem(row: SiteIntegration): IntegrationListItem {
  // Strip the encrypted-blob columns; consumers should never see them.
  const rest: Partial<SiteIntegration> = { ...row };
  delete rest.config;
  delete rest.configIv;
  delete rest.configTag;
  return rest as IntegrationListItem;
}

export async function createIntegration(
  siteId: number,
  input: IntegrationCreateInput,
): Promise<IntegrationListItem> {
  const db = getDb();
  const blob = encrypt(input.config);
  const [row] = await db.insert(siteIntegrations).values({
    siteId,
    kind: input.kind,
    label: input.label ?? null,
    config: blob.ciphertext,
    configIv: blob.iv,
    configTag: blob.tag,
  }).returning();
  return toListItem(row);
}

interface GetOpts { decrypt?: boolean }

export async function getIntegration(
  id: number,
  opts: GetOpts = {},
): Promise<IntegrationListItem | IntegrationWithPlain | null> {
  const db = getDb();
  const [row] = await db.select().from(siteIntegrations).where(eq(siteIntegrations.id, id)).limit(1);
  if (!row) return null;
  if (opts.decrypt) {
    const plain = decrypt(row.config, row.configIv, row.configTag) as Record<string, unknown>;
    return { ...row, configPlain: plain };
  }
  return toListItem(row);
}

export async function listIntegrations(siteId: number): Promise<IntegrationListItem[]> {
  const db = getDb();
  const rows = await db.select().from(siteIntegrations).where(eq(siteIntegrations.siteId, siteId));
  return rows.map(toListItem);
}

export async function updateIntegration(
  id: number,
  input: IntegrationUpdateInput,
): Promise<IntegrationListItem> {
  const db = getDb();
  const patch: Partial<typeof siteIntegrations.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.label !== undefined) patch.label = input.label;
  if (input.config !== undefined) {
    const blob = encrypt(input.config);
    patch.config = blob.ciphertext;
    patch.configIv = blob.iv;
    patch.configTag = blob.tag;
  }
  const [row] = await db.update(siteIntegrations)
    .set(patch)
    .where(eq(siteIntegrations.id, id))
    .returning();
  if (!row) throw new IntegrationNotFoundError(id);
  return toListItem(row);
}

export async function deleteIntegration(id: number): Promise<void> {
  const db = getDb();
  await db.delete(siteIntegrations).where(eq(siteIntegrations.id, id));
}

/**
 * Stamp a site's integration of a given kind as just-verified: writes
 * `lastVerifiedAt = now` and flips `status` to "connected". Called after a
 * successful live "Test connection" (or a fresh OAuth connect) so the
 * integrations table shows a real, trustworthy "last verified" time instead of
 * the previously-never-written column. Returns the new timestamp, or null if no
 * such row exists (e.g. GA4, which is stored on the site, not as a row).
 */
export async function markIntegrationVerified(siteId: number, kind: string): Promise<Date | null> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .update(siteIntegrations)
    .set({ lastVerifiedAt: now, status: "connected", updatedAt: now })
    .where(and(eq(siteIntegrations.siteId, siteId), eq(siteIntegrations.kind, kind)))
    .returning({ id: siteIntegrations.id });
  return rows.length > 0 ? now : null;
}
