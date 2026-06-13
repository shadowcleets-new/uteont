/**
 * @file campaigns.ts
 * @description LO-36 — campaigns + keyword clusters. A campaign groups keyword
 * clusters (themed keyword groups) under one goal so the operator can run a
 * coordinated push instead of juggling flat per-site targets.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { campaigns, keywordClusters } from "@/lib/db/schema";

export async function createCampaign(input: {
  siteId: number;
  name: string;
  goal?: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(campaigns)
    .values({ siteId: input.siteId, name: input.name, goal: input.goal ?? null, status: "active" })
    .returning();
  return row;
}

export async function listCampaigns(siteId?: number) {
  const db = getDb();
  return db
    .select()
    .from(campaigns)
    .where(siteId ? eq(campaigns.siteId, siteId) : undefined)
    .orderBy(desc(campaigns.id))
    .limit(100);
}

export async function getCampaign(id: number) {
  const db = getDb();
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return row ?? null;
}

export async function updateCampaignStatus(id: number, status: string) {
  const db = getDb();
  const [row] = await db
    .update(campaigns)
    .set({ status, updatedAt: new Date() })
    .where(eq(campaigns.id, id))
    .returning();
  return row ?? null;
}

export async function createCluster(input: {
  siteId: number;
  campaignId?: number | null;
  name: string;
  intent?: string | null;
  keywords: string[];
}) {
  const db = getDb();
  const [row] = await db
    .insert(keywordClusters)
    .values({
      siteId: input.siteId,
      campaignId: input.campaignId ?? null,
      name: input.name,
      intent: input.intent ?? null,
      keywords: input.keywords,
    })
    .returning();
  return row;
}

export async function listClusters(opts: { siteId?: number; campaignId?: number } = {}) {
  const db = getDb();
  const conds = [];
  if (opts.siteId) conds.push(eq(keywordClusters.siteId, opts.siteId));
  if (opts.campaignId) conds.push(eq(keywordClusters.campaignId, opts.campaignId));
  return db
    .select()
    .from(keywordClusters)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(keywordClusters.id))
    .limit(200);
}

/** A campaign with its clusters, for the detail view. */
export async function getCampaignDetail(id: number) {
  const campaign = await getCampaign(id);
  if (!campaign) return null;
  const clusters = await listClusters({ campaignId: id });
  return { campaign, clusters };
}
