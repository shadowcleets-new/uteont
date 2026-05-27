/**
 * Gemini HTTP client for Vercel functions.
 *
 * Mirrors the worker's `worker/agents/_gemini.py` but in TypeScript so the
 * Director Agent (which lives in /api/director/message) can call Gemini
 * without round-tripping through the worker.
 *
 * Free tier on gemini-2.5-flash: 1500 req/day, 1M tokens/day — plenty for
 * the Director's planning calls.
 */

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
  };
}

export interface GeminiResult {
  text: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
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
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }
  const generationConfig: Record<string, unknown> = {};
  if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;
  if (opts.maxOutputTokens !== undefined)
    generationConfig.maxOutputTokens = opts.maxOutputTokens;
  if (opts.responseMimeType) generationConfig.responseMimeType = opts.responseMimeType;
  if (opts.responseSchema) generationConfig.responseSchema = opts.responseSchema;
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

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
    throw new GeminiError(`Network error calling Gemini: ${e}`, e);
  }

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok || data.error) {
    throw new GeminiError(
      `Gemini API error ${res.status}: ${data.error?.message ?? res.statusText}`,
    );
  }

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";

  return {
    text,
    finishReason: data.candidates?.[0]?.finishReason,
    usage: data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: data.usageMetadata.totalTokenCount ?? 0,
        }
      : undefined,
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
