"use server";

import { revalidatePath } from "next/cache";
import { enqueueJob } from "@/lib/services/jobs";
import { listSites } from "@/lib/services/sites";
import { getKvSetting } from "@/lib/services/app-settings";

/**
 * LO-62: enqueue a tactics-scraper job. A `notebooklmUrl` routes through the
 * NotebookLM controller (video→tactics); otherwise `sources` (one URL per line,
 * blank = the 6 default communities) drive the community scraper.
 */
export async function runTacticsScrapeAction(formData: FormData): Promise<void> {
  const sources = String(formData.get("sources") ?? "").trim();
  const notebooklmUrl = String(formData.get("notebooklmUrl") ?? "").trim();

  // Resolve a site to attach the job to (active site, else the first site).
  let siteId = await getKvSetting<number | null>("ui.activeSiteId", null);
  if (!siteId) {
    const sites = await listSites().catch(() => []);
    siteId = sites[0]?.id ?? null;
  }
  if (!siteId) return; // no site yet — nothing to attach to

  const payload: Record<string, unknown> = {};
  if (notebooklmUrl) payload.notebooklmUrl = notebooklmUrl;
  else if (sources) payload.sources = sources;

  await enqueueJob({ agentKey: "tactics-scraper", siteId, payload });
  revalidatePath("/tactics");
}
