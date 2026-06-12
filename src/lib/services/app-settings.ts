/**
 * @file app-settings.ts
 * @description Generic kv_settings get/set + typed accessors for operator
 * preferences that live in the database rather than env (so they're editable
 * from /settings without a redeploy): Critic strictness (LO-60), autonomy
 * level (LO-20), and the outreach domain allowlist (LO-58).
 *
 * All reads fail-soft: a DB error or missing row returns the provided default,
 * never throws — settings must never break a request path.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";
import { isCritiqueStrictness, type CritiqueStrictness } from "./critic";

// #region Generic kv access
export async function getKvSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ value: kvSettings.value })
      .from(kvSettings)
      .where(eq(kvSettings.key, key))
      .limit(1);
    if (row && row.value !== undefined && row.value !== null) return row.value as T;
  } catch (e) {
    console.warn(`[settings] read failed for ${key}`, e);
  }
  return fallback;
}

export async function setKvSetting(key: string, value: unknown): Promise<void> {
  const db = getDb();
  await db
    .insert(kvSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: kvSettings.key, set: { value, updatedAt: new Date() } });
}
// #endregion

// #region Critic strictness (LO-60)
export const CRITIC_STRICTNESS_KEY = "critic.strictness";

export async function getCriticStrictness(): Promise<CritiqueStrictness> {
  const raw = await getKvSetting<unknown>(CRITIC_STRICTNESS_KEY, "standard");
  return isCritiqueStrictness(raw) ? raw : "standard";
}

export async function setCriticStrictness(value: CritiqueStrictness): Promise<void> {
  await setKvSetting(CRITIC_STRICTNESS_KEY, value);
}
// #endregion

// #region Outreach domain allowlist (LO-58)
export const OUTREACH_ALLOWLIST_KEY = "outreach.domain_allowlist";

export async function getOutreachAllowlist(): Promise<string[]> {
  const raw = await getKvSetting<unknown>(OUTREACH_ALLOWLIST_KEY, []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

export async function setOutreachAllowlist(domains: string[]): Promise<void> {
  await setKvSetting(OUTREACH_ALLOWLIST_KEY, domains);
}
// #endregion

// #region Autonomy level (LO-20)
export type AutonomyLevel = "L1" | "L2" | "L3" | "L4";
export const AUTONOMY_LEVEL_KEY = "autonomy.level";

export function isAutonomyLevel(v: unknown): v is AutonomyLevel {
  return v === "L1" || v === "L2" || v === "L3" || v === "L4";
}

export async function getAutonomyLevel(): Promise<AutonomyLevel> {
  const raw = await getKvSetting<unknown>(AUTONOMY_LEVEL_KEY, "L2");
  return isAutonomyLevel(raw) ? raw : "L2";
}

export async function setAutonomyLevel(value: AutonomyLevel): Promise<void> {
  await setKvSetting(AUTONOMY_LEVEL_KEY, value);
}
// #endregion
