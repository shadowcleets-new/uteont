import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  siteIntegrations,
  type SiteIntegration,
} from "@/lib/db/schema";
import type {
  IntegrationCreateInput,
  IntegrationUpdateInput,
} from "@/lib/validation/site";

/**
 * Surfaced when the caller tries to register a second integration of the
 * same kind on the same site. The composite unique index enforces it at
 * the DB layer; this typed error gives the route layer enough context to
 * return a 409 with the Re-verify hint.
 */
export class IntegrationAlreadyExistsError extends Error {
  readonly siteId: number;
  readonly kind: string;
  readonly existing?: SiteIntegration;
  constructor(siteId: number, kind: string, existing?: SiteIntegration) {
    super(
      `Integration of kind "${kind}" already exists for site ${siteId}.`,
    );
    this.name = "IntegrationAlreadyExistsError";
    this.siteId = siteId;
    this.kind = kind;
    this.existing = existing;
  }
}

export async function listIntegrations(
  siteId: number,
): Promise<SiteIntegration[]> {
  const db = getDb();
  return db
    .select()
    .from(siteIntegrations)
    .where(eq(siteIntegrations.siteId, siteId));
}

export async function getIntegration(
  id: number,
): Promise<SiteIntegration | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(siteIntegrations)
    .where(eq(siteIntegrations.id, id))
    .limit(1);
  return row ?? null;
}

export async function findIntegrationByKind(
  siteId: number,
  kind: string,
): Promise<SiteIntegration | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(siteIntegrations)
    .where(
      and(eq(siteIntegrations.siteId, siteId), eq(siteIntegrations.kind, kind)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Pre-flight dedup check + insert. Two callers competing on the same
 * (siteId, kind) will both pass the check, but the composite unique
 * index catches the loser and we surface it as a typed conflict.
 */
export async function createIntegration(
  siteId: number,
  input: IntegrationCreateInput,
): Promise<SiteIntegration> {
  const existing = await findIntegrationByKind(siteId, input.kind);
  if (existing) {
    throw new IntegrationAlreadyExistsError(siteId, input.kind, existing);
  }
  const db = getDb();
  try {
    const [row] = await db
      .insert(siteIntegrations)
      .values({
        siteId,
        kind: input.kind,
        label: input.label ?? null,
        config: input.config,
      })
      .returning();
    return row;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /site_integrations_site_kind_unique_idx|duplicate key value/i.test(msg)
    ) {
      const dup = await findIntegrationByKind(siteId, input.kind);
      throw new IntegrationAlreadyExistsError(
        siteId,
        input.kind,
        dup ?? undefined,
      );
    }
    throw e;
  }
}

export async function updateIntegration(
  id: number,
  input: IntegrationUpdateInput,
): Promise<SiteIntegration> {
  const db = getDb();
  const [row] = await db
    .update(siteIntegrations)
    .set({
      label: input.label,
      config: input.config,
      updatedAt: new Date(),
    })
    .where(eq(siteIntegrations.id, id))
    .returning();
  return row;
}

export async function deleteIntegration(id: number): Promise<void> {
  const db = getDb();
  await db.delete(siteIntegrations).where(eq(siteIntegrations.id, id));
}

/**
 * Records a successful or failed verification ping. Used by both the
 * verify endpoint and the planned cron-driven health check.
 */
export async function recordVerification(
  id: number,
  ok: boolean,
  error?: string,
): Promise<SiteIntegration> {
  const db = getDb();
  const [row] = await db
    .update(siteIntegrations)
    .set({
      status: ok ? "active" : "error",
      lastVerifiedAt: new Date(),
      lastError: ok ? null : (error ?? "Verification failed"),
      updatedAt: new Date(),
    })
    .where(eq(siteIntegrations.id, id))
    .returning();
  return row;
}
