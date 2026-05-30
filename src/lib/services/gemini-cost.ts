/**
 * Gemini token pricing -> USD estimate, for observability only.
 * Numbers are public list prices per 1M tokens. The Director runs on the
 * free tier so real spend is $0; this estimates the *equivalent* paid cost
 * so dashboards can reason about usage if tiers change.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
}

// USD per 1,000,000 tokens. Keyed by model id prefix (longest match wins).
// Source: Google Gemini API pricing (paid-tier list price), 2026.
export const PRICE_PER_1M_TOKENS: Record<
  string,
  { input: number; output: number; cached: number }
> = {
  "gemini-flash-latest":    { input: 0.075,  output: 0.3,  cached: 0.01875 },
  "gemini-2.5-flash":       { input: 0.075,  output: 0.3,  cached: 0.01875 },
  "gemini-2.5-flash-lite":  { input: 0.0375, output: 0.15, cached: 0.009375 },
  "gemini-2.5-pro":         { input: 1.25,   output: 10.0, cached: 0.3125 },
};

const FALLBACK = { input: 0.075, output: 0.3, cached: 0.01875 };

function priceFor(model: string): { input: number; output: number; cached: number } {
  let best = FALLBACK;
  let bestLen = -1;
  for (const [prefix, price] of Object.entries(PRICE_PER_1M_TOKENS)) {
    if (model.startsWith(prefix) && prefix.length > bestLen) {
      best = price;
      bestLen = prefix.length;
    }
  }
  return best;
}

/** Estimate USD cost for one call. Cached tokens bill at the cheaper cached rate. */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const p = priceFor(model);
  const cached = usage.cachedTokens ?? 0;
  const billableInput = Math.max(0, usage.promptTokens - cached);
  const cost =
    (billableInput * p.input + cached * p.cached + usage.completionTokens * p.output) /
    1_000_000;
  // round to 8 dp — sub-cent precision without float noise
  return Math.round(cost * 1e8) / 1e8;
}
