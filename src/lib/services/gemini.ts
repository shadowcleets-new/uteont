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

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-flash-latest";

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
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

  const startedAt = Date.now();
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
    costUsd: usage
      ? estimateCostUsd(model, {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          cachedTokens: usage.cachedTokens,
        })
      : undefined,
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
  const result = await complete(prompt, {
    ...opts,
    responseMimeType: "application/json",
  });
  let stripped = result.text.trim();
  // Strip code fences in case the model added them despite responseMimeType
  if (stripped.startsWith("```")) {
    stripped = stripped.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  }
  let data: T;
  try {
    data = JSON.parse(stripped) as T;
  } catch (e) {
    throw new GeminiError(
      `Gemini response wasn't valid JSON. Got: ${stripped.slice(0, 200)}`,
      e,
    );
  }
  return { data, raw: stripped, usage: result.usage };
}
