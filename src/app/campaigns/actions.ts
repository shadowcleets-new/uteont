"use server";

import { revalidatePath } from "next/cache";
import { createCampaign, createCluster, updateCampaignStatus } from "@/lib/services/campaigns";
import { listSites } from "@/lib/services/sites";
import { getKvSetting } from "@/lib/services/app-settings";

async function resolveSiteId(): Promise<number | null> {
  let siteId = await getKvSetting<number | null>("ui.activeSiteId", null);
  if (!siteId) {
    const sites = await listSites().catch(() => []);
    siteId = sites[0]?.id ?? null;
  }
  return siteId;
}

export async function createCampaignAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const goal = String(formData.get("goal") ?? "").trim() || null;
  const siteId = await resolveSiteId();
  if (!siteId) return;
  await createCampaign({ siteId, name, goal });
  revalidatePath("/campaigns");
}

export async function setCampaignStatusAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isFinite(id) || !["active", "paused", "done", "archived"].includes(status)) return;
  await updateCampaignStatus(id, status);
  revalidatePath("/campaigns");
}

export async function createClusterAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const campaignId = Number(formData.get("campaignId")) || null;
  const intent = String(formData.get("intent") ?? "").trim() || null;
  const keywords = String(formData.get("keywords") ?? "")
    .split(/[\n,]/)
    .map((k) => k.trim())
    .filter(Boolean);
  const siteId = await resolveSiteId();
  if (!siteId) return;
  await createCluster({ siteId, campaignId, name, intent, keywords });
  revalidatePath(campaignId ? `/campaigns/${campaignId}` : "/campaigns");
}
