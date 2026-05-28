import { getDb } from "@/lib/db/client";
import { siteIntegrations, type SiteIntegration } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto/integration-secrets";
import type {
  IntegrationCreateInput, IntegrationUpdateInput,
} from "@/lib/validation/site";

export type IntegrationListItem = Omit<SiteIntegration, "config" | "configIv" | "configTag">;
export type IntegrationWithPlain = SiteIntegration & { configPlain: Record<string, unknown> };

function toListItem(row: SiteIntegration): IntegrationListItem {
  // Strip the encrypted-blob columns; consumers should never see them.
  const { config: _c, configIv: _iv, configTag: _t, ...rest } = row;
  return rest;
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
  return toListItem(row);
}

export async function deleteIntegration(id: number): Promise<void> {
  const db = getDb();
  await db.delete(siteIntegrations).where(eq(siteIntegrations.id, id));
}
