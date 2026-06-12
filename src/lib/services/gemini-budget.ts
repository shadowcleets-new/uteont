/**
 * @file gemini-budget.ts
 * @description Lightweight daily Gemini request budget tracker. The free tier
 * is ~1500 requests/day on Flash; this counts calls per UTC day in kv_settings
 * so quota-aware consumers (the Critic, LO-59) can stand down when the budget
 * is nearly exhausted and leave room for the producing agents. Best-effort and
 * fail-soft: a DB hiccup never blocks a Gemini call.
 */

import { getKvSetting, setKvSetting } from "./app-settings";

/** Daily request cap. Override via GEMINI_DAILY_REQUEST_CAP. */
export const GEMINI_DAILY_CAP = Number(process.env.GEMINI_DAILY_REQUEST_CAP) || 1500;

/** Fraction of the daily budget still available, clamped to [0, 1]. Pure. */
export function remainingFraction(spent: number, cap: number = GEMINI_DAILY_CAP): number {
  if (!cap || cap <= 0) return 0;
  return Math.max(0, Math.min(1, (cap - spent) / cap));
}

/** kv key for a given day's counter (UTC). Pure. */
export function dailyBudgetKey(now: Date): string {
  return `gemini.budget.${now.toISOString().slice(0, 10)}`;
}

/** Increment today's Gemini call counter (best-effort). */
export async function recordGeminiCall(): Promise<void> {
  try {
    const key = dailyBudgetKey(new Date());
    const current = await getKvSetting<number>(key, 0);
    await setKvSetting(key, (typeof current === "number" ? current : 0) + 1);
  } catch (e) {
    console.warn("[gemini-budget] record failed", e);
  }
}

/** Fraction of today's Gemini budget still available (1 if untracked). */
export async function remainingBudgetFraction(): Promise<number> {
  try {
    const spent = await getKvSetting<number>(dailyBudgetKey(new Date()), 0);
    return remainingFraction(typeof spent === "number" ? spent : 0);
  } catch {
    return 1;
  }
}
