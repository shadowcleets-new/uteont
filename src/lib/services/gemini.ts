/**
 * Gemini HTTP client for Vercel functions.
 *
 * Mirrors the worker's `worker/agents/_gemini.py` but in TypeScript so the
 * Director Agent (which lives in /api/director/message) can call Gemini
 * without round-tripping through the worker.
 *
 * Free tier on gemini-flash-latest: plenty for the Director's planning calls.
 */

import { logEvent } from "@/lib/observability/logger";
import { estimateCostUsd } from "./gemini-cost";
import { checkBudgetCap } from "./cost-ledger";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-flash-latest";

// #region Daily budget cap (N-06)
/**
 * Per-process daily spend accumulator, keyed by UTC day ("YYYY-MM-DD"). The
 * cap itself comes from GEMINI_DAILY_BUDGET_USD; when that env var is unset (or
 * not a positive finite number) the cap resolves to null and checkBudgetCap
 * treats spend as unlimited, so default behavior is unchanged.
 */
const dailySpendUsd = new Map<string, number>();

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Parse GEMINI_DAILY_BUDGET_USD; unset/invalid/non-positive => null (unlimited). */
function dailyBudgetCapUsd(): number | null {
  const raw = process.env.GEMINI_DAILY_BUDGET_USD;
  if (raw == null || raw.trim() === "") return null;
  const cap = Number(raw);
  return Number.isFinite(cap) && cap > 0 ? cap : null;
}

function spentTodayUsd(): number {
  return dailySpendUsd.get(utcDay()) ?? 0;
}

function recordSpendUsd(costUsd: number): void {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  const day = utcDay();
  dailySpendUsd.set(day, (dailySpendUsd.get(day) ?? 0) + costUsd);
}

/** Test-only: clear the per-process spend accumulator so cases start at $0. */
export function __resetDailySpendForTests(): void {
  dailySpendUsd.clear();
}
// #endregion

export class GeminiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "GeminiError";
  }
}

export interface GeminiOptions {
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: "application/json" | "text/plain";
  responseSchema?: Record<string, unknown>;
  /**
   * Gemini 2.5+ thinking budget (output tokens reserved for internal reasoning).
   * 0 disables thinking — important for structured/JSON calls so the whole
   * output budget goes to the response and the JSON isn't truncated mid-stream.
   */
  thinkingBudget?: number;
  /**
   * Explicit Gemini cachedContents handle (e.g. "cachedContents/abc"). When
   * set, the cached system instruction is reused and `systemInstruction` is
   * ignored (it already lives in the cache).
   */
  cachedContent?: string;
  /** Logical task name for observability (e.g. "director"). */
  task?: string;
  /** Correlation id for observability. */
  traceId?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { code: number; message: string; status: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

export interface GeminiResult {
  text: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
  };
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError(
      "GEMINI_API_KEY not set in Vercel environment. Add it via vercel env add.",
    );
  }
  return key;
}

/** Plain text completion. */
export async function complete(
  prompt: string,
  opts: GeminiOptions = {},
): Promise<GeminiResult> {
  const apiKey = getApiKey();
  const model = opts.model ?? DEFAULT_MODEL;

  // Budget cap (N-06): refuse the call before spending the network round-trip
  // once today's accumulated spend hits the configured daily cap. Unset env =>
  // null cap => never exceeded, so default behavior is unchanged.
  if (checkBudgetCap(spentTodayUsd(), dailyBudgetCapUsd()).exceeded) {
    throw new GeminiError(
      `Gemini daily budget cap of $${dailyBudgetCapUsd()} USD exceeded (spent $${spentTodayUsd()} today). Set GEMINI_DAILY_BUDGET_USD higher or unset it to disable the cap.`,
    );
  }

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  // Explicit cache holds the system instruction; never send both.
  if (opts.cachedContent) {
    body.cachedContent = opts.cachedContent;
  } else if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }
  const generationConfig: Record<string, unknown> = {};
  if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;
  if (opts.maxOutputTokens !== undefined)
    generationConfig.maxOutputTokens = opts.maxOutputTokens;
  if (opts.responseMimeType) generationConfig.responseMimeType = opts.responseMimeType;
  if (opts.responseSchema) generationConfig.responseSchema = opts.responseSchema;
  if (opts.thinkingBudget !== undefined) generationConfig.thinkingConfig = { thinkingBudget: opts.thinkingBudget };
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

  const startedAt = Date.now();
  // Count this call toward the daily Gemini budget (best-effort, fire-and-forget)
  // so quota-aware consumers like the Critic can stand down near exhaustion.
  void import("./gemini-budget").then((m) => m.recordGeminiCall()).catch(() => {});
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    logEvent({
      kind: "model.call",
      model,
      task: opts.task,
      traceId: opts.traceId,
      durationMs: Date.now() - startedAt,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
    throw new GeminiError(`Network error calling Gemini: ${e}`, e);
  }

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok || data.error) {
    logEvent({
      kind: "model.call",
      model,
      task: opts.task,
      traceId: opts.traceId,
      durationMs: Date.now() - startedAt,
      status: "error",
      error: data.error?.message ?? res.statusText,
    });
    throw new GeminiError(
      `Gemini API error ${res.status}: ${data.error?.message ?? res.statusText}`,
    );
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  const usage = data.usageMetadata
    ? {
        promptTokens: data.usageMetadata.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata.totalTokenCount ?? 0,
        cachedTokens: data.usageMetadata.cachedContentTokenCount ?? 0,
      }
    : undefined;

  const costUsd = usage
    ? estimateCostUsd(model, {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedTokens: usage.cachedTokens,
      })
    : undefined;

  // Feed the budget cap: accumulate this call's estimated spend so subsequent
  // calls today are checked against the running total (N-06).
  if (costUsd !== undefined) recordSpendUsd(costUsd);

  logEvent({
    kind: "model.call",
    model,
    task: opts.task,
    traceId: opts.traceId,
    durationMs: Date.now() - startedAt,
    status: "ok",
    promptTokens: usage?.promptTokens,
    completionTokens: usage?.completionTokens,
    totalTokens: usage?.totalTokens,
    cachedTokens: usage?.cachedTokens,
    cached: Boolean(opts.cachedContent),
    costUsd,
  });

  return {
    text,
    finishReason: data.candidates?.[0]?.finishReason,
    usage,
  };
}

/**
 * JSON-typed completion. Strips ```json fences and parses.
 * Throws GeminiError if the response isn't valid JSON after stripping.
 */
export async function completeJson<T = unknown>(
  prompt: string,
  opts: GeminiOptions = {},
): Promise<{ data: T; raw: string; usage?: GeminiResult["usage"] }> {
  const strip = (s: string) => {
    let out = s.trim();
    if (out.startsWith("```")) out = out.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
    return out;
  };

  let result = await complete(prompt, { ...opts, responseMimeType: "application/json" });
  let stripped = strip(result.text);

  // Self-heal truncation: a thinking model can spend the output budget on
  // internal reasoning and cut the JSON off mid-stream (finishReason
  // MAX_TOKENS). Retry once with thinking disabled + a larger budget so the
  // full JSON comes back.
  if (result.finishReason === "MAX_TOKENS") {
    result = await complete(prompt, {
      ...opts,
      responseMimeType: "application/json",
      thinkingBudget: 0,
      maxOutputTokens: Math.max((opts.maxOutputTokens ?? 2048) * 2, 8192),
    });
    stripped = strip(result.text);
  }

  let data: T;
  try {
    data = JSON.parse(stripped) as T;
  } catch (e) {
    const why = result.finishReason === "MAX_TOKENS" ? " (response truncated — hit the token limit)" : "";
    throw new GeminiError(
      `Gemini response wasn't valid JSON${why}. Got: ${stripped.slice(0, 200)}`,
      e,
    );
  }
  return { data, raw: stripped, usage: result.usage };
}
