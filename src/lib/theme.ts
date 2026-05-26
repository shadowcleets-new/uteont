/**
 * UTEONT brand theme — Anthropic palette + typography helpers.
 * Single source of truth for visual tokens.
 */

export const colors = {
  dark:       "#141413",
  light:      "#faf9f5",
  midGray:    "#b0aea5",
  lightGray:  "#e8e6dc",
  orange:     "#d97757",
  blue:       "#6a9bcc",
  green:      "#788c5d",
} as const;

export const semantic = {
  bg:             "#faf9f5",
  surface:        "#ffffff",
  surfaceAlt:     "#f3f1ea",
  border:         "#e8e6dc",
  borderStrong:   "#cfccc1",
  text:           "#141413",
  textSecondary:  "#6b6a64",
  textTertiary:   "#9a988e",
  accent:         "#d97757",
  accentHover:    "#c66948",
  info:           "#6a9bcc",
  success:        "#788c5d",
  error:          "#a33b2b",
} as const;

export type PillState = "Idle" | "Planned" | "Running" | "Success" | "Failed";

export const pillClasses: Record<PillState, string> = {
  Idle:    "bg-[#e8e6dc] text-[#6b6a64]",
  Planned: "bg-[#f3f1ea] text-[#9a988e]",
  Running: "bg-[#d97757] text-white",
  Success: "bg-[#788c5d] text-white",
  Failed:  "bg-[#a33b2b] text-white",
};
