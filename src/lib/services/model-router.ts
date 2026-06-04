/**
 * Central model selection. Keeps model choice (and the env overrides that
 * tune cost) in one place instead of scattered string literals.
 *
 * Today the only TS-side LLM caller is the Director, which runs on the free
 * gemini-flash-latest tier. This indirection lets us route a step to a
 * cheaper/faster model via env without touching call sites.
 */

export type ModelTask = "director" | "director-report" | "summarize";

const DEFAULT_MODEL = "gemini-flash-latest";

export function pickModel(task: ModelTask): string {
  switch (task) {
    case "director":
    case "director-report":
      return process.env.GEMINI_MODEL_DIRECTOR?.trim() || DEFAULT_MODEL;
    case "summarize":
      // Conversation compaction — always the cheapest Flash tier.
      return process.env.GEMINI_MODEL_SUMMARIZE?.trim() || DEFAULT_MODEL;
    default:
      return DEFAULT_MODEL;
  }
}
