"use server";

import { revalidatePath } from "next/cache";
import { createTarget, deleteTarget } from "@/lib/services/targets";

/** Create a target from the control-panel form. */
export async function createTargetAction(formData: FormData): Promise<void> {
  const siteId = Number(formData.get("siteId"));
  const title = String(formData.get("title") ?? "").trim();
  const metric = String(formData.get("metric") ?? "manual");
  const baselineValue = Number(formData.get("baselineValue"));
  const goalValue = Number(formData.get("goalValue"));
  const manualRaw = formData.get("manualCurrent");
  const deadlineRaw = String(formData.get("deadlineAt") ?? "");

  if (!siteId || !title || !deadlineRaw) return;
  if (Number.isNaN(baselineValue) || Number.isNaN(goalValue)) return;

  await createTarget({
    siteId,
    title: title.slice(0, 200),
    metric,
    baselineValue,
    goalValue,
    manualCurrent: manualRaw != null && manualRaw !== "" ? Number(manualRaw) : null,
    deadlineAt: new Date(deadlineRaw),
  });
  revalidatePath("/targets");
}

export async function deleteTargetAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteTarget(id);
  revalidatePath("/targets");
}
