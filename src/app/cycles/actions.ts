"use server";

import { revalidatePath } from "next/cache";
import { createCycle } from "@/lib/services/cycles";
import { getActiveSiteId } from "@/lib/services/app-settings";

/** LO-70: create a cycle from the /cycles page form. */
export async function createCycleAction(formData: FormData): Promise<void> {
  const goal = String(formData.get("goal") ?? "").trim();
  if (!goal) return;
  const seedTerms = String(formData.get("seedTerms") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const siteId = await getActiveSiteId();
  if (!siteId) return;

  await createCycle(goal, seedTerms, siteId);
  revalidatePath("/cycles");
}
