"use server";

import { revalidatePath } from "next/cache";
import { createTarget, deleteTarget, updateTarget, type TargetUpdateInput } from "@/lib/services/targets";

/** Create a target from the control-panel form. */
export async function createTargetAction(formData: FormData): Promise<void> {
  const siteId = Number(formData.get("siteId"));
  const title = String(formData.get("title") ?? "").trim();
  const metric = String(formData.get("metric") ?? "manual");
  const direction = String(formData.get("direction") ?? "increase") === "decrease" ? "decrease" : "increase";
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
    direction,
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

/** Edit an existing target's title / baseline / goal / deadline (preserves history). */
export async function updateTargetAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;
  const patch: TargetUpdateInput = {};
  const title = formData.get("title");
  if (typeof title === "string" && title.trim()) patch.title = title.trim().slice(0, 200);
  const goal = formData.get("goalValue");
  if (goal != null && goal !== "" && !Number.isNaN(Number(goal))) patch.goalValue = Number(goal);
  const base = formData.get("baselineValue");
  if (base != null && base !== "" && !Number.isNaN(Number(base))) patch.baselineValue = Number(base);
  const deadline = formData.get("deadlineAt");
  if (typeof deadline === "string" && deadline) patch.deadlineAt = new Date(deadline);
  if (Object.keys(patch).length === 0) return;
  await updateTarget(id, patch);
  revalidatePath("/targets");
}

/** Pause / resume / archive a target via its lifecycle status. */
export async function setTargetStatusAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!id || !["active", "paused", "archived"].includes(status)) return;
  await updateTarget(id, { status });
  revalidatePath("/targets");
}

/** Log a new current value for a 'manual'-metric target (its progress-logging path). */
export async function updateManualCurrentAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const v = formData.get("manualCurrent");
  if (!id || v == null || v === "" || Number.isNaN(Number(v))) return;
  await updateTarget(id, { manualCurrent: Number(v) });
  revalidatePath("/targets");
}
