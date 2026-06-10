/**
 * Cost-projection helpers for the Target configuration UI (Milestone 3).
 *
 * The model is intentionally simple:
 *   Complexity = wordCount * coverageScore * 1.4
 *
 * Higher coverage scores force the Research + Ideation agents to chase
 * more sub-topics and entities, which is the dominant token-cost driver.
 * The multiplier accounts for the 30-40 % overhead of QA + SEO passes
 * relayed via the worker.
 */
export function projectedComplexity(
  wordCount: number,
  coverageScore: number,
): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  if (!Number.isFinite(coverageScore) || coverageScore <= 0) return 0;
  return wordCount * coverageScore * 1.4;
}

export type CostTier = "green" | "amber" | "red";

export interface CostTierInfo {
  tier: CostTier;
  label: string;
  fill: string;
  percent: number; // 0-100 — width of the meter bar
}

const RED_CAP = 30000;

export function costTier(complexity: number): CostTierInfo {
  // Linear-clamped fill against a sensible upper bound so the bar fills
  // smoothly instead of saturating at the first threshold.
  const percent = Math.min(100, Math.max(0, (complexity / RED_CAP) * 100));
  if (complexity < 5000) {
    return {
      tier: "green",
      label: "Highly Cost-Effective",
      fill: "#788c5d",
      percent,
    };
  }
  if (complexity <= 12000) {
    return {
      tier: "amber",
      label: "Moderate Token Usage",
      fill: "#d97757",
      percent,
    };
  }
  return {
    tier: "red",
    label: "Resource Intensive",
    fill: "#a33b2b",
    percent,
  };
}
