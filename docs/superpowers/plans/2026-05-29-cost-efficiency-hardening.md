# Cost-Efficiency Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut UTEONT pipeline cost with four additive, kill-switched levers — result dedup (skip whole worker runs on identical requests), token/cost observability, explicit Gemini context caching for the Director, and centralized model routing — without changing any existing behavior.

**Architecture:** One new table (`result_cache`) and four new modules, wired into the two existing job-enqueue entry points (the Director and `runAgent`). A dedup hit at enqueue time *replays* a stored result via the extracted `applyJobResult` side-effect reproducer instead of running the worker. Every new path is gated by a per-agent TTL map and an env kill-switch, and fails safe (any error falls through to the normal enqueue/inline path). The expensive LLM (Gemini 3.1 Pro) is worker-side/Python and out of scope; the only TS-side LLM caller is the Director on the free `gemini-flash-latest` tier, so the highest-ROI lever here is dedup.

**Tech Stack:** Next.js 16.2.6 (App Router), TypeScript, Drizzle ORM 0.45 (Neon HTTP driver), Vitest 4, zod 4, Node `crypto` (sha256). Gemini via raw `fetch` (no AI SDK).

---

## Working Conventions (read before starting)

- **Working directory:** the worktree root — `C:\Users\acer\.claude\projects\uteont\.claude\worktrees\cost-efficiency-hardening`. All `npm`/`git`/`node` commands assume CWD = this worktree. (The branch is `worktree-cost-efficiency-hardening`, stacked on `worktree-site-context-foundation`.)
- **Preflight (already done by the orchestrator, verify if a fresh subagent):** `.env.local` must exist in the worktree root (copied from the main repo) so Drizzle CLI + Vitest can reach the **live shared Neon DB**. It is git-ignored (`.env*.local`). If missing: `Copy-Item "C:\Users\acer\.claude\projects\uteont\.env.local" ".\.env.local" -Force`.
- **Live DB discipline:** Tests hit the live shared Neon DB. Every test MUST use random keys and delete every row it creates. Follow the existing pattern in `src/lib/services/sites.test.ts` (`getDb()`, random key, `{ timeout: 15000 }`, `db.delete(...).where(eq(...))`).
- **No typecheck npm script exists.** Use `npx tsc --noEmit` for typechecking.
- **Commit trailer:** every `git commit` ends with the Co-Authored-By trailer. All commit commands below already include it as a second `-m`.
- **AGENTS.md:** "This is NOT the Next.js you know." No Next.js API surface changes here, but if you touch a route, read `node_modules/next/dist/docs/` first.
- **Secret hygiene (F-031/F-032):** never paste live secrets into code, tests, commits, or this doc. `.env.local` stays untracked.

## File Structure

**New files:**
- `src/lib/observability/logger.ts` — structured JSON event logger (`newTraceId`, `logEvent`, `timed`). Zero deps, never throws into callers.
- `src/lib/observability/logger.test.ts` — unit tests (pure, no DB).
- `src/lib/services/model-router.ts` — `pickModel(task)`; centralizes model choice + env override.
- `src/lib/services/model-router.test.ts` — unit tests (env-driven, pure).
- `src/lib/services/gemini-cost.ts` — `PRICE_PER_1M_TOKENS`, `estimateCostUsd`. Pure pricing math for observability.
- `src/lib/services/gemini-cost.test.ts` — unit tests (pure).
- `src/lib/services/gemini-cache.ts` — `getOrCreateCachedContent(...)`; explicit Gemini `cachedContents` with kv_settings + in-memory registry, kill-switch + graceful fallback.
- `src/lib/services/gemini-cache.test.ts` — unit tests on the guard paths (pure, fetch-spied).
- `src/lib/services/result-cache.ts` — TTL map, `dedupEnabled`, `isDedupeEligible`, `computeDedupeKey`, `isCacheableResult`, `lookupResult`, `storeResult`, `bumpHitCount`.
- `src/lib/services/result-cache.test.ts` — pure key/eligibility tests + one live-DB store/lookup/bump round-trip.

**Modified files:**
- `src/lib/db/schema.ts` — add `resultCache` pgTable + `ResultCache` type export.
- `drizzle/0005_*.sql` — generated migration (via `npm run db:generate`).
- `src/app/api/db-status/route.ts` — add `"result_cache"` to `EXPECTED_TABLES` (16 → 17).
- `src/lib/services/gemini.ts` — add `cachedContent`/`task`/`traceId` options, `cachedTokens` in usage, and a `model.call` log event + cost estimate.
- `src/lib/services/jobs.ts` — extract `applyJobResult`, add `dispatchAgentJob`, rewrite `completeJob` to delegate + store-to-cache. `enqueueJob` unchanged.
- `src/lib/services/agents.ts` — `runAgent` worker branch uses `dispatchAgentJob`; `RunAgentResult` gains `"cached"` mode + `forceFresh` input.
- `src/lib/validation/schemas.ts` — `RunAgentRequest` gains `forceFresh?: boolean`.
- `src/app/api/agents/[key]/run/route.ts` — pass `forceFresh` through to `runAgent`.
- `src/lib/services/director.ts` — use `dispatchAgentJob`; widen `enqueued` items; post `job-completed` system messages for cache hits after the assistant message; wire `pickModel` + `getOrCreateCachedContent` + `traceId` into the Gemini call.
- `.env.example` — document `GEMINI_MODEL_DIRECTOR`, `GEMINI_CONTEXT_CACHE`, `RESULT_DEDUP`.

---

## Task 1: Observability logger

**Files:**
- Create: `src/lib/observability/logger.ts`
- Test: `src/lib/observability/logger.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/observability/logger.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { newTraceId, logEvent, timed } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("observability logger", () => {
  it("newTraceId returns unique ids with a tr_ prefix", () => {
    const a = newTraceId();
    const b = newTraceId();
    expect(a).toMatch(/^tr_/);
    expect(b).toMatch(/^tr_/);
    expect(a).not.toBe(b);
  });

  it("logEvent never throws, even on circular structures", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const circular: Record<string, unknown> = { kind: "test" };
    circular.self = circular;
    expect(() => logEvent(circular as never)).not.toThrow();
    spy.mockRestore();
  });

  it("timed returns the wrapped value and logs status ok with a duration", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const out = await timed({ kind: "unit.test" }, async () => 42);
    expect(out).toBe(42);
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain('"status":"ok"');
    expect(line).toContain('"durationMs"');
  });

  it("timed re-throws and logs status error", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      timed({ kind: "unit.test" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(String(spy.mock.calls[0][0])).toContain('"status":"error"');
    expect(String(spy.mock.calls[0][0])).toContain("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/observability/logger.test.ts`
Expected: FAIL — `Failed to resolve import "./logger"` / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/observability/logger.ts`:

```ts
/**
 * Lightweight structured logger for cost + latency observability.
 *
 * Emits one JSON line per event to stdout (captured by Vercel logs).
 * Zero dependencies, and NEVER throws into the caller — observability must
 * not be able to break the pipeline.
 */

export type LogEvent = {
  kind: string; // e.g. "model.call", "dedup.hit", "dedup.miss"
  traceId?: string;
  agentKey?: string;
  model?: string;
  task?: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  cached?: boolean;
  status?: "ok" | "error";
  [key: string]: unknown; // free-form extra fields
};

let _counter = 0;

/** Generate a short, unique-ish trace id for correlating a request's events. */
export function newTraceId(): string {
  _counter = (_counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `tr_${Date.now().toString(36)}${_counter.toString(36)}${rand}`;
}

/** Emit one structured event. Never throws. */
export function logEvent(event: LogEvent): void {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
    console.log(`[obs] ${line}`);
  } catch {
    // logging must never break the caller (e.g. circular refs)
  }
}

/**
 * Time an async function and emit one event with its duration. Logs
 * status "ok" | "error"; re-throws the original error so control flow
 * is unchanged.
 */
export async function timed<T>(
  meta: Omit<LogEvent, "durationMs" | "status">,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const out = await fn();
    logEvent({ ...meta, durationMs: Date.now() - start, status: "ok" });
    return out;
  } catch (e) {
    logEvent({
      ...meta,
      durationMs: Date.now() - start,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/observability/logger.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/logger.ts src/lib/observability/logger.test.ts
git commit -m "feat(obs): structured cost/latency logger" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Model router

**Files:**
- Create: `src/lib/services/model-router.ts`
- Test: `src/lib/services/model-router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/model-router.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { pickModel } from "./model-router";

const ORIGINAL = process.env.GEMINI_MODEL_DIRECTOR;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.GEMINI_MODEL_DIRECTOR;
  else process.env.GEMINI_MODEL_DIRECTOR = ORIGINAL;
});

describe("model router", () => {
  it("defaults director to gemini-flash-latest", () => {
    delete process.env.GEMINI_MODEL_DIRECTOR;
    expect(pickModel("director")).toBe("gemini-flash-latest");
    expect(pickModel("director-report")).toBe("gemini-flash-latest");
  });

  it("respects the GEMINI_MODEL_DIRECTOR override", () => {
    process.env.GEMINI_MODEL_DIRECTOR = "gemini-2.5-flash-lite";
    expect(pickModel("director")).toBe("gemini-2.5-flash-lite");
  });

  it("ignores a blank override", () => {
    process.env.GEMINI_MODEL_DIRECTOR = "   ";
    expect(pickModel("director")).toBe("gemini-flash-latest");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/model-router.test.ts`
Expected: FAIL — cannot resolve `./model-router`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/services/model-router.ts`:

```ts
/**
 * Central model selection. Keeps model choice (and the env overrides that
 * tune cost) in one place instead of scattered string literals.
 *
 * Today the only TS-side LLM caller is the Director, which runs on the free
 * gemini-flash-latest tier. This indirection lets us route a step to a
 * cheaper/faster model via env without touching call sites.
 */

export type ModelTask = "director" | "director-report";

const DEFAULT_MODEL = "gemini-flash-latest";

export function pickModel(task: ModelTask): string {
  switch (task) {
    case "director":
    case "director-report":
      return process.env.GEMINI_MODEL_DIRECTOR?.trim() || DEFAULT_MODEL;
    default:
      return DEFAULT_MODEL;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/model-router.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/model-router.ts src/lib/services/model-router.test.ts
git commit -m "feat(model): central model router with env override" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Gemini cost estimate + gemini.ts cachedContent & logging

**Files:**
- Create: `src/lib/services/gemini-cost.ts`
- Test: `src/lib/services/gemini-cost.test.ts`
- Modify: `src/lib/services/gemini.ts` (full replacement below)
- Test: `src/lib/services/gemini.test.ts`

- [ ] **Step 1: Write the failing cost test**

Create `src/lib/services/gemini-cost.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "./gemini-cost";

describe("estimateCostUsd", () => {
  it("computes flash cost from prompt + completion tokens", () => {
    // 1,000,000 input @ .075 + 1,000,000 output @ .30 = .375
    expect(
      estimateCostUsd("gemini-flash-latest", {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.375, 6);
  });

  it("bills cached tokens at the cheaper cached rate", () => {
    // 1,000,000 prompt all cached, 0 completion = 1,000,000 * .01875 / 1e6
    expect(
      estimateCostUsd("gemini-flash-latest", {
        promptTokens: 1_000_000,
        completionTokens: 0,
        cachedTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.01875, 6);
  });

  it("falls back to flash pricing for an unknown model", () => {
    expect(
      estimateCostUsd("some-unknown-model", {
        promptTokens: 1_000_000,
        completionTokens: 0,
      }),
    ).toBeCloseTo(0.075, 6);
  });

  it("never goes negative when cached exceeds prompt", () => {
    expect(
      estimateCostUsd("gemini-flash-latest", {
        promptTokens: 10,
        completionTokens: 0,
        cachedTokens: 100,
      }),
    ).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/services/gemini-cost.test.ts`
Expected: FAIL — cannot resolve `./gemini-cost`.

- [ ] **Step 3: Implement gemini-cost.ts**

Create `src/lib/services/gemini-cost.ts`:

```ts
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
```

- [ ] **Step 4: Run cost test to verify it passes**

Run: `npx vitest run src/lib/services/gemini-cost.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing gemini client test**

Create `src/lib/services/gemini.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { complete } from "./gemini";

const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("gemini client", () => {
  it("returns cachedTokens from usageMetadata and logs a model.call event", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
          totalTokenCount: 120,
          cachedContentTokenCount: 80,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await complete("hello", { task: "unit", traceId: "tr_x" });
    expect(res.text).toBe("hi");
    expect(res.usage?.cachedTokens).toBe(80);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("model.call");
    expect(logged).toContain('"cachedTokens":80');
  });

  it("sends cachedContent and omits systemInstruction when a cache handle is given", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    let sentBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(String(init.body));
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await complete("hello", {
      systemInstruction: "SYS",
      cachedContent: "cachedContents/abc",
    });
    expect(sentBody.cachedContent).toBe("cachedContents/abc");
    expect(sentBody.systemInstruction).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/services/gemini.test.ts`
Expected: FAIL — `res.usage?.cachedTokens` is `undefined` and no `model.call` log (old gemini.ts).

- [ ] **Step 7: Replace gemini.ts with the cache- + logging-aware version**

Replace the **entire contents** of `src/lib/services/gemini.ts` with:

```ts
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
```

- [ ] **Step 8: Run gemini + cost tests to verify they pass**

Run: `npx vitest run src/lib/services/gemini.test.ts src/lib/services/gemini-cost.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/gemini-cost.ts src/lib/services/gemini-cost.test.ts src/lib/services/gemini.ts src/lib/services/gemini.test.ts
git commit -m "feat(gemini): cachedContent support + token/cost observability" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: result_cache schema + migration + table-count guard

**Files:**
- Modify: `src/lib/db/schema.ts` (add table after the `messages` table block; add type export)
- Modify: `src/app/api/db-status/route.ts:19-36` (EXPECTED_TABLES 16 → 17)
- Create (generated): `drizzle/0005_*.sql`

- [ ] **Step 1: Add the resultCache table to schema.ts**

In `src/lib/db/schema.ts`, insert the following **after** the `messages` pgTable block (the `);` that closes `export const messages = pgTable(...)`) and **before** the `export type Site = ...` line:

```ts
/**
 * Cost-efficiency: result dedup cache. A finished agent result is keyed by a
 * deterministic hash of (agentKey, siteId, site-profile signature, payload).
 * A future enqueue with the same key replays the stored result instead of
 * running the worker again. TTL is per-agent (see services/result-cache.ts).
 */
export const resultCache = pgTable(
  "result_cache",
  {
    id:          serial("id").primaryKey(),
    dedupeKey:   text("dedupe_key").notNull(),
    agentKey:    text("agent_key").notNull(),
    siteId:      integer("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    result:      jsonb("result").$type<Record<string, unknown>>().notNull(),
    sourceRunId: integer("source_run_id"),
    sourceJobId: integer("source_job_id"),
    hitCount:    integer("hit_count").notNull().default(0),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt:   timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byKey:     uniqueIndex("result_cache_dedupe_key_unique_idx").on(t.dedupeKey),
    byAgent:   index("result_cache_agent_site_idx").on(t.agentKey, t.siteId),
    byExpires: index("result_cache_expires_idx").on(t.expiresAt),
  }),
);
```

Then add this type export **after** the `export type Message = typeof messages.$inferSelect;` line (end of file):

```ts
export type ResultCache = typeof resultCache.$inferSelect;
```

(`pgTable`, `serial`, `text`, `integer`, `jsonb`, `timestamp`, `index`, `uniqueIndex` are already imported at the top of the file — no import change needed.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: drizzle-kit prints a new file `drizzle/0005_<random-name>.sql` containing `CREATE TABLE "result_cache"` plus the three indexes, and updates `drizzle/meta/_journal.json`.

- [ ] **Step 3: Inspect the generated SQL**

Run: `Get-ChildItem drizzle/0005_*.sql | Get-Content`
Expected: a `CREATE TABLE IF NOT EXISTS "result_cache"` (or `CREATE TABLE "result_cache"`) statement, a `result_cache_dedupe_key_unique_idx` unique index, `result_cache_agent_site_idx`, `result_cache_expires_idx`, and a foreign key to `sites(id)` with `ON DELETE cascade`. If the FK or indexes are missing, fix schema.ts and re-run `npm run db:generate` (delete the bad 0005 file first).

- [ ] **Step 4: Apply the migration to Neon**

Run: `npm run db:migrate`
Expected: drizzle-kit applies pending migration(s). It should apply only `0005` (0000–0004 already applied to the shared DB by the prior project).

- [ ] **Step 5: Verify on Neon directly (F-034 — do not trust drizzle's "applied")**

Run:
```bash
node -e "require('dotenv').config({path:'.env.local'});const {neon}=require('@neondatabase/serverless');(async()=>{const sql=neon(process.env.DATABASE_URL);const r=await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='result_cache'`;console.log(r.length?'OK: result_cache present':'MISSING: result_cache');process.exit(r.length?0:1);})().catch(e=>{console.error(e);process.exit(1)});"
```
Expected: prints `OK: result_cache present` and exits 0.

If it prints MISSING (migrate silently skipped — the May 27 incident pattern), apply the generated SQL directly, then re-run this verify:
```bash
node -e "require('dotenv').config({path:'.env.local'});const fs=require('fs');const {neon}=require('@neondatabase/serverless');const file=fs.readdirSync('drizzle').find(f=>f.startsWith('0005_'));const ddl=fs.readFileSync('drizzle/'+file,'utf8');(async()=>{const sql=neon(process.env.DATABASE_URL);for(const stmt of ddl.split('--> statement-breakpoint')){const s=stmt.trim();if(s)await sql(s);}console.log('applied',file);})().catch(e=>{console.error(e);process.exit(1)});"
```

- [ ] **Step 6: Bump EXPECTED_TABLES (16 → 17)**

In `src/app/api/db-status/route.ts`, add `"result_cache"` to the `EXPECTED_TABLES` array, keeping alphabetical order (between `"notifications"` and `"runs"`). Change:

```ts
    "notifications",
    "runs",
```
to:
```ts
    "notifications",
    "result_cache",
    "runs",
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the new table + type compile; route still typechecks).

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts src/app/api/db-status/route.ts drizzle/0005_*.sql drizzle/meta
git commit -m "feat(db): add result_cache table + migration; db-status expects 17 tables" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: result-cache service

**Files:**
- Create: `src/lib/services/result-cache.ts`
- Test: `src/lib/services/result-cache.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/result-cache.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, resultCache } from "@/lib/db/schema";
import { createSite } from "./sites";
import {
  computeDedupeKey,
  isDedupeEligible,
  isCacheableResult,
  storeResult,
  lookupResult,
  bumpHitCount,
} from "./result-cache";

const rand = () => Math.random().toString(36).slice(2, 8);

const ORIGINAL_DEDUP = process.env.RESULT_DEDUP;
afterEach(() => {
  if (ORIGINAL_DEDUP === undefined) delete process.env.RESULT_DEDUP;
  else process.env.RESULT_DEDUP = ORIGINAL_DEDUP;
});

const sitePayload = (over: Record<string, unknown> = {}) => ({
  seeds: ["a", "b"],
  site: { domain: "https://x.com", locale: "en-US", niche: "demo", voiceGuide: "Warm", contentPillars: ["p1"], bannedPhrases: [] },
  ...over,
});

describe("computeDedupeKey", () => {
  it("is stable regardless of object key order", () => {
    const a = computeDedupeKey("research", 1, { x: 1, y: 2, site: { locale: "en" } });
    const b = computeDedupeKey("research", 1, { y: 2, site: { locale: "en" }, x: 1 });
    expect(a).toBe(b);
  });

  it("ignores volatile keys (_directorContext, forceFresh, _dedupeKey)", () => {
    const base = computeDedupeKey("research", 1, sitePayload());
    const withVolatile = computeDedupeKey("research", 1, {
      ...sitePayload(),
      _directorContext: { conversationId: 99 },
      forceFresh: true,
      _dedupeKey: "stale",
    });
    expect(base).toBe(withVolatile);
  });

  it("changes when a site profile field (voiceGuide) changes", () => {
    const a = computeDedupeKey("research", 1, sitePayload());
    const b = computeDedupeKey("research", 1, sitePayload({ site: { domain: "https://x.com", locale: "en-US", niche: "demo", voiceGuide: "Terse", contentPillars: ["p1"], bannedPhrases: [] } }));
    expect(a).not.toBe(b);
  });

  it("respects array order (different order => different key)", () => {
    const a = computeDedupeKey("research", 1, { seeds: ["a", "b"] });
    const b = computeDedupeKey("research", 1, { seeds: ["b", "a"] });
    expect(a).not.toBe(b);
  });

  it("changes when siteId changes", () => {
    expect(computeDedupeKey("research", 1, sitePayload())).not.toBe(
      computeDedupeKey("research", 2, sitePayload()),
    );
  });
});

describe("isDedupeEligible", () => {
  it("is true for worker agents with a positive TTL", () => {
    delete process.env.RESULT_DEDUP;
    expect(isDedupeEligible("research")).toBe(true);
    expect(isDedupeEligible("content-writing")).toBe(true);
  });

  it("is false for fn agents with TTL 0 (qa, seo-optimization)", () => {
    delete process.env.RESULT_DEDUP;
    expect(isDedupeEligible("qa")).toBe(false);
    expect(isDedupeEligible("seo-optimization")).toBe(false);
  });

  it("is false for everything when RESULT_DEDUP=off", () => {
    process.env.RESULT_DEDUP = "off";
    expect(isDedupeEligible("research")).toBe(false);
  });
});

describe("isCacheableResult", () => {
  it("requires non-empty keywords for research", () => {
    expect(isCacheableResult("research", { keywords: [{ keyword: "k" }] })).toBe(true);
    expect(isCacheableResult("research", { keywords: [] })).toBe(false);
  });
  it("requires title and body for content-writing", () => {
    expect(isCacheableResult("content-writing", { title: "t", body: "b" })).toBe(true);
    expect(isCacheableResult("content-writing", { title: "t" })).toBe(false);
  });
  it("requires a body for backlink", () => {
    expect(isCacheableResult("backlink", { body: "draft" })).toBe(true);
    expect(isCacheableResult("backlink", {})).toBe(false);
  });
});

describe("store / lookup / bump (live DB)", () => {
  it("round-trips a cache row and increments hitCount", { timeout: 15000 }, async () => {
    const db = getDb();
    const site = await createSite({
      key: `cache-${rand()}`, name: "C", domain: "https://c.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const dedupeKey = `test-${rand()}-${rand()}`;
    try {
      await storeResult({
        dedupeKey, agentKey: "research", siteId: site.id,
        result: { keywords: [{ keyword: "x" }] }, sourceRunId: null, sourceJobId: 123,
      });
      const hit = await lookupResult(dedupeKey);
      expect(hit).not.toBeNull();
      expect(hit!.sourceJobId).toBe(123);
      expect(Array.isArray((hit!.result as { keywords?: unknown[] }).keywords)).toBe(true);

      await bumpHitCount(hit!.id);
      const [row] = await db.select().from(resultCache).where(eq(resultCache.dedupeKey, dedupeKey)).limit(1);
      expect(row.hitCount).toBe(1);
    } finally {
      await db.delete(resultCache).where(eq(resultCache.dedupeKey, dedupeKey));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });

  it("treats an expired row as a miss", { timeout: 15000 }, async () => {
    const db = getDb();
    const site = await createSite({
      key: `cache-${rand()}`, name: "C", domain: "https://c.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const dedupeKey = `test-${rand()}-${rand()}`;
    try {
      // Insert directly with a past expiry (storeResult always sets a future one).
      await db.insert(resultCache).values({
        dedupeKey, agentKey: "research", siteId: site.id,
        result: { keywords: [{ keyword: "x" }] }, hitCount: 0,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await lookupResult(dedupeKey)).toBeNull();
    } finally {
      await db.delete(resultCache).where(eq(resultCache.dedupeKey, dedupeKey));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/services/result-cache.test.ts`
Expected: FAIL — cannot resolve `./result-cache`.

- [ ] **Step 3: Implement result-cache.ts**

Create `src/lib/services/result-cache.ts`:

```ts
/**
 * Result dedup cache.
 *
 * A finished agent result is stored keyed by a deterministic hash of the
 * request (agentKey + siteId + site-profile signature + canonicalized
 * payload). A later enqueue with the same key replays the stored result
 * (see services/jobs.ts dispatchAgentJob) instead of running the worker.
 *
 * TTL is per-agent. TTL 0 disables dedup for that agent (e.g. the
 * deterministic fn agents, where inline recompute is cheaper than replay).
 */

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { resultCache } from "@/lib/db/schema";

// Per-agent TTL in seconds. 0 = dedup disabled for that agent.
export const TTL_SECONDS_BY_AGENT: Record<string, number> = {
  research: 7 * 24 * 3600,
  "idea-generation": 7 * 24 * 3600,
  "content-writing": 30 * 24 * 3600,
  backlink: 7 * 24 * 3600,
  qa: 0,
  "seo-optimization": 0,
};

/** Global kill-switch. RESULT_DEDUP=off disables all dedup. */
export function dedupEnabled(): boolean {
  return process.env.RESULT_DEDUP?.trim().toLowerCase() !== "off";
}

/** True only when dedup is on AND this agent has a positive TTL. */
export function isDedupeEligible(agentKey: string): boolean {
  if (!dedupEnabled()) return false;
  const ttl = TTL_SECONDS_BY_AGENT[agentKey];
  return typeof ttl === "number" && ttl > 0;
}

// Keys that must not affect the dedupe identity.
const VOLATILE_KEYS = new Set(["_directorContext", "_dedupeKey", "forceFresh", "site"]);

// Site-profile fields that DO affect output (so editing them invalidates cache).
const PROFILE_FIELDS = [
  "locale",
  "domain",
  "niche",
  "audience",
  "voiceGuide",
  "contentPillars",
  "bannedPhrases",
] as const;

/** Recursively sort object keys; preserve array order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = canonicalize(src[k]);
    return out;
  }
  return value;
}

function profileSignature(payload: Record<string, unknown>): string {
  const site = (payload.site ?? {}) as Record<string, unknown>;
  const sig: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) sig[f] = site[f] ?? null;
  return JSON.stringify(canonicalize(sig));
}

export function computeDedupeKey(
  agentKey: string,
  siteId: number,
  payload: Record<string, unknown>,
): string {
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!VOLATILE_KEYS.has(k)) stripped[k] = v;
  }
  const profileSig = profileSignature(payload);
  const canonical = JSON.stringify(canonicalize(stripped));
  const material = `${agentKey} ${siteId} ${profileSig} ${canonical}`;
  return createHash("sha256").update(material).digest("hex");
}

/** Decide whether a result is worth caching (non-empty, useful output only). */
export function isCacheableResult(
  agentKey: string,
  result: Record<string, unknown>,
): boolean {
  switch (agentKey) {
    case "research":
      return Array.isArray(result.keywords) && result.keywords.length > 0;
    case "idea-generation":
      return Array.isArray(result.ideas) && result.ideas.length > 0;
    case "content-writing":
      return Boolean(result.title) && Boolean(result.body);
    case "backlink":
      return Boolean(result.body) || Boolean((result as { draft?: unknown }).draft);
    default:
      return false;
  }
}

export interface CachedLookup {
  id: number;
  result: Record<string, unknown>;
  sourceRunId: number | null;
  sourceJobId: number | null;
}

/** Look up a live (non-expired) cache row. Expired rows are treated as misses. */
export async function lookupResult(dedupeKey: string): Promise<CachedLookup | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(resultCache)
    .where(eq(resultCache.dedupeKey, dedupeKey))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt instanceof Date && row.expiresAt.getTime() <= Date.now()) return null;
  return {
    id: row.id,
    result: row.result as Record<string, unknown>,
    sourceRunId: row.sourceRunId ?? null,
    sourceJobId: row.sourceJobId ?? null,
  };
}

/** Upsert a cache row. No-op if the agent's TTL is 0. */
export async function storeResult(input: {
  dedupeKey: string;
  agentKey: string;
  siteId: number;
  result: Record<string, unknown>;
  sourceRunId?: number | null;
  sourceJobId?: number | null;
}): Promise<void> {
  const ttl = TTL_SECONDS_BY_AGENT[input.agentKey] ?? 0;
  if (ttl <= 0) return;
  const db = getDb();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await db
    .insert(resultCache)
    .values({
      dedupeKey: input.dedupeKey,
      agentKey: input.agentKey,
      siteId: input.siteId,
      result: input.result,
      sourceRunId: input.sourceRunId ?? null,
      sourceJobId: input.sourceJobId ?? null,
      hitCount: 0,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: resultCache.dedupeKey,
      set: {
        result: input.result,
        sourceRunId: input.sourceRunId ?? null,
        sourceJobId: input.sourceJobId ?? null,
        expiresAt,
      },
    });
}

export async function bumpHitCount(id: number): Promise<void> {
  const db = getDb();
  await db
    .update(resultCache)
    .set({ hitCount: sql`${resultCache.hitCount} + 1` })
    .where(eq(resultCache.id, id));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/services/result-cache.test.ts`
Expected: PASS (all describe blocks). The two live-DB tests create + delete a throwaway site and cache row.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/result-cache.ts src/lib/services/result-cache.test.ts
git commit -m "feat(dedup): result-cache service (key, eligibility, store/lookup)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: applyJobResult extraction + dispatchAgentJob + dedup wiring

> **Highest-care task.** The refactor must keep the real worker path byte-identical. `applyJobResult` reproduces exactly what `completeJob` used to do after a result exists; `completeJob` now delegates to it and adds a best-effort cache store; `dispatchAgentJob` adds the hit/miss path in front of `enqueueJob`. The Director and `runAgent` swap their direct `enqueueJob` call for `dispatchAgentJob`. `enqueueJob` itself stays a pure insert.

**Files:**
- Modify: `src/lib/services/jobs.ts` (imports; add `applyJobResult` + `dispatchAgentJob` + `DispatchResult`; rewrite `completeJob`)
- Modify: `src/lib/services/agents.ts` (`RunAgentResult`, `runAgent` worker branch, `forceFresh`)
- Modify: `src/lib/validation/schemas.ts` (`RunAgentRequest.forceFresh`)
- Modify: `src/app/api/agents/[key]/run/route.ts` (pass `forceFresh`)
- Modify: `src/lib/services/director.ts` (use `dispatchAgentJob`; widen `enqueued`; post cached `job-completed` system messages)
- Test: `src/lib/services/dispatch.test.ts` (live-DB round-trip)

- [ ] **Step 1: Write the failing dispatch round-trip test**

Create `src/lib/services/dispatch.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sites, runs, jobs, resultCache, notifications } from "@/lib/db/schema";
import { createSite } from "./sites";
import { dispatchAgentJob, completeJob } from "./jobs";
import { computeDedupeKey, lookupResult } from "./result-cache";

const rand = () => Math.random().toString(36).slice(2, 8);

const ORIGINAL_DEDUP = process.env.RESULT_DEDUP;
afterEach(() => {
  if (ORIGINAL_DEDUP === undefined) delete process.env.RESULT_DEDUP;
  else process.env.RESULT_DEDUP = ORIGINAL_DEDUP;
});

describe("dispatchAgentJob + completeJob dedup round-trip (live DB)", () => {
  it("misses then replays then bypasses with forceFresh", { timeout: 30000 }, async () => {
    delete process.env.RESULT_DEDUP; // dedup on
    const db = getDb();
    const testStart = new Date();
    const site = await createSite({
      key: `disp-${rand()}`, name: "D", domain: "https://d.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const payload = {
      targetSite: "example.org",
      context: "ctx",
      site: { domain: "https://d.com", locale: "en-US", niche: null, audience: null, voiceGuide: null, contentPillars: [], bannedPhrases: [] },
    };
    const expectedKey = computeDedupeKey("backlink", site.id, payload);
    try {
      // 1. MISS -> enqueued, _dedupeKey stamped onto the job payload
      const d1 = await dispatchAgentJob({ agentKey: "backlink", siteId: site.id, payload: { ...payload } });
      expect(d1.mode).toBe("enqueued");
      if (d1.mode !== "enqueued") throw new Error("unreachable");
      expect((d1.job.payload as Record<string, unknown>)._dedupeKey).toBe(expectedKey);

      // 2. completeJob stores a cacheable result
      await completeJob(d1.job.id, { body: "outreach draft", target_site: "example.org" });
      const stored = await lookupResult(expectedKey);
      expect(stored).not.toBeNull();
      expect((stored!.result as { body?: string }).body).toBe("outreach draft");

      // 3. HIT -> cached replay (no new job), same body
      const d2 = await dispatchAgentJob({ agentKey: "backlink", siteId: site.id, payload: { ...payload } });
      expect(d2.mode).toBe("cached");
      if (d2.mode !== "cached") throw new Error("unreachable");
      expect((d2.result as { body?: string }).body).toBe("outreach draft");

      // 4. forceFresh -> bypass cache, enqueue again
      const d3 = await dispatchAgentJob({ agentKey: "backlink", siteId: site.id, payload: { ...payload }, forceFresh: true });
      expect(d3.mode).toBe("enqueued");
    } finally {
      // Clean up every row this test created (RESTRICT FKs: runs/jobs before site).
      await db.delete(runs).where(eq(runs.siteId, site.id));
      await db.delete(jobs).where(eq(jobs.siteId, site.id));
      await db.delete(resultCache).where(eq(resultCache.siteId, site.id));
      await db.delete(notifications).where(
        and(eq(notifications.subject, "backlink completed"), gte(notifications.createdAt, testStart)),
      );
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });

  it("RESULT_DEDUP=off and TTL-0 agents bypass the cache", { timeout: 30000 }, async () => {
    const db = getDb();
    const site = await createSite({
      key: `disp2-${rand()}`, name: "D2", domain: "https://d2.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const payload = {
      targetSite: "e.org",
      context: "c",
      site: { domain: "https://d2.com", locale: "en-US", niche: null, audience: null, voiceGuide: null, contentPillars: [], bannedPhrases: [] },
    };
    const key = computeDedupeKey("backlink", site.id, payload);
    try {
      // Seed a live cache row, then prove the kill-switch ignores it.
      await storeResult({ dedupeKey: key, agentKey: "backlink", siteId: site.id, result: { body: "seed" }, sourceJobId: 1 });
      process.env.RESULT_DEDUP = "off";
      const off = await dispatchAgentJob({ agentKey: "backlink", siteId: site.id, payload: { ...payload } });
      expect(off.mode).toBe("enqueued");
      delete process.env.RESULT_DEDUP;

      // qa has TTL 0 (dedup disabled) -> always enqueues, never replays.
      const qa = await dispatchAgentJob({ agentKey: "qa", siteId: site.id, payload: { article: "x" } });
      expect(qa.mode).toBe("enqueued");
    } finally {
      await db.delete(jobs).where(eq(jobs.siteId, site.id));
      await db.delete(resultCache).where(eq(resultCache.siteId, site.id));
      await db.delete(sites).where(eq(sites.id, site.id));
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/services/dispatch.test.ts`
Expected: FAIL — `dispatchAgentJob` is not exported from `./jobs`.

- [ ] **Step 3: Update jobs.ts imports**

In `src/lib/services/jobs.ts`, replace the top import block:

```ts
import { and, eq, inArray, sql, desc, asc, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, runs, keywords, ideas, articles } from "@/lib/db/schema";
import { notifyJobSuccess, notifyJobFailure } from "./notify-job";
```

with:

```ts
import { and, eq, inArray, sql, desc, asc, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, runs, keywords, ideas, articles } from "@/lib/db/schema";
import { notifyJobSuccess, notifyJobFailure } from "./notify-job";
import {
  isDedupeEligible,
  isCacheableResult,
  computeDedupeKey,
  lookupResult,
  storeResult,
  bumpHitCount,
} from "./result-cache";
import { logEvent } from "@/lib/observability/logger";
```

- [ ] **Step 4: Add applyJobResult, DispatchResult, and dispatchAgentJob**

In `src/lib/services/jobs.ts`, **immediately after** the `enqueueJob` function (after its closing `}` on the line `  return row;\n}`) and before `claimNextJob`, insert:

```ts
export type DispatchResult =
  | { mode: "enqueued"; job: typeof jobs.$inferSelect }
  | { mode: "cached"; runId: number; result: Record<string, unknown>; sourceJobId: number | null };

/**
 * Dedup-aware enqueue. If the agent is dedupe-eligible and this request hashes
 * to a live cached result (and forceFresh isn't set), replay that result via
 * applyJobResult instead of enqueuing a worker job. Any failure falls through
 * to a normal enqueue (fail-safe — dedup can never block real work).
 */
export async function dispatchAgentJob(
  input: EnqueueJobInput & { forceFresh?: boolean },
): Promise<DispatchResult> {
  const payload: Record<string, unknown> = { ...input.payload };

  if (isDedupeEligible(input.agentKey) && !input.forceFresh) {
    const dedupeKey = computeDedupeKey(input.agentKey, input.siteId, payload);
    let hit: Awaited<ReturnType<typeof lookupResult>> = null;
    try {
      hit = await lookupResult(dedupeKey);
    } catch (e) {
      console.warn("dispatchAgentJob: lookupResult failed; enqueuing fresh", e);
      hit = null;
    }
    if (hit) {
      try {
        const { runId } = await applyJobResult({
          agentKey: input.agentKey,
          siteId: input.siteId,
          cycleId: input.cycleId ?? null,
          payload,
          result: hit.result,
          jobId: null,
          notifyJobId: hit.sourceJobId ?? 0,
          startedAt: new Date(),
          suppressDirectorMessage: true,
        });
        try {
          await bumpHitCount(hit.id);
        } catch (e) {
          console.warn("dispatchAgentJob: bumpHitCount failed", e);
        }
        logEvent({
          kind: "dedup.hit",
          agentKey: input.agentKey,
          siteId: input.siteId,
          sourceJobId: hit.sourceJobId ?? undefined,
        });
        return { mode: "cached", runId, result: hit.result, sourceJobId: hit.sourceJobId ?? null };
      } catch (e) {
        // Replay failed — fall through to a normal enqueue.
        console.warn("dispatchAgentJob: cache replay failed; enqueuing fresh", e);
      }
    } else {
      logEvent({ kind: "dedup.miss", agentKey: input.agentKey, siteId: input.siteId });
    }
    // Miss (or replay failure): stamp the key so completeJob stores the fresh result.
    payload._dedupeKey = dedupeKey;
  }

  const job = await enqueueJob({
    agentKey: input.agentKey,
    siteId: input.siteId,
    payload,
    cycleId: input.cycleId,
    priority: input.priority,
    maxAttempts: input.maxAttempts,
  });
  return { mode: "enqueued", job };
}

/**
 * Apply all side-effects of a finished agent result: write the runs row,
 * persist agent-specific output, send the Telegram notification, and (unless
 * suppressed) post the Director conversation system message.
 *
 * Extracted from completeJob so a cached replay can reproduce the exact same
 * effects without a real job. On the real worker path completeJob calls this
 * with the job's real ids, so behavior is unchanged.
 */
export interface ApplyJobResultInput {
  agentKey: string;
  siteId: number;
  cycleId: number | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  jobId?: number | null; // runs.job_id — null on replay
  notifyJobId?: number; // Telegram message/button id — replay passes sourceJobId ?? 0
  startedAt?: Date;
  suppressDirectorMessage?: boolean; // replay-from-Director sets true (Director re-posts)
}

export async function applyJobResult(input: ApplyJobResultInput): Promise<{ runId: number }> {
  const db = getDb();

  // 1. Write a runs row (telemetry)
  const [run] = await db
    .insert(runs)
    .values({
      subjectKey: `agent.${input.agentKey}`,
      category: "agent",
      action: `worker:${input.agentKey}`,
      siteId: input.siteId,
      cycleId: input.cycleId,
      jobId: input.jobId ?? null,
      startedAt: input.startedAt ?? new Date(),
      finishedAt: new Date(),
      status: "success",
      result: input.result,
    })
    .returning();

  // 2. Agent-specific persistence (each wrapped — a typed-table issue must not
  //    roll back the runs row).
  try {
    if (input.agentKey === "research") {
      await persistResearchKeywords(input.siteId, input.cycleId, run.id, input.result);
    } else if (input.agentKey === "idea-generation") {
      await persistIdeas(input.cycleId, input.result);
    } else if (input.agentKey === "content-writing") {
      await persistArticle(input.siteId, input.cycleId, input.payload, input.result);
    }
    // outreach/backlink: result captured in runs.result; no typed table v1.
  } catch (e) {
    console.warn(`applyJobResult: agent-persist failed for ${input.agentKey}`, e);
  }

  // 3. Telegram notification (best-effort, never throws into caller)
  try {
    await notifyJobSuccess(input.agentKey, input.notifyJobId ?? 0, input.result);
  } catch (e) {
    console.warn("applyJobResult: notifyJobSuccess failed", e);
  }

  // 4. Director conversation system message (unless the caller will post it).
  if (!input.suppressDirectorMessage) {
    try {
      const ctx = (input.payload as Record<string, unknown> | null)?.["_directorContext"] as
        | { conversationId?: number }
        | undefined;
      if (ctx?.conversationId) {
        const { appendMessage } = await import("./conversations");
        await appendMessage({
          conversationId: ctx.conversationId,
          role: "system",
          content: `${input.agentKey} job ${input.notifyJobId ?? input.jobId ?? 0} completed`,
          payload: {
            kind: "job-completed",
            agentKey: input.agentKey,
            jobId: input.jobId ?? null,
            result: input.result,
          },
        });
      }
    } catch (e) {
      console.warn("applyJobResult: director-conversation update failed", e);
    }
  }

  return { runId: run.id };
}
```

(Note: `applyJobResult` references `persistResearchKeywords`, `persistIdeas`, `persistArticle` which are function declarations later in the file — hoisting makes this fine.)

- [ ] **Step 5: Rewrite completeJob to delegate + store-to-cache**

In `src/lib/services/jobs.ts`, replace the **entire** `completeJob` function (from its doc comment `/** Complete a job: ... */` through its closing `}`) with:

```ts
/**
 * Complete a job: mark it done, apply all result side-effects (runs row,
 * persistence, notification, Director message), then best-effort store the
 * result for dedup if eligible.
 */
export async function completeJob(jobId: number, result: Record<string, unknown>) {
  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return;

  // 1. Mark job done
  await db
    .update(jobs)
    .set({ status: "done", finishedAt: new Date(), result })
    .where(eq(jobs.id, jobId));

  // 2. Apply all result side-effects (identical to the pre-refactor behavior)
  const startedAt = (job.claimedAt as Date | null) ?? (job.createdAt as Date);
  const { runId } = await applyJobResult({
    agentKey: job.agentKey,
    siteId: job.siteId,
    cycleId: job.cycleId,
    payload: (job.payload ?? {}) as Record<string, unknown>,
    result,
    jobId: job.id,
    notifyJobId: job.id,
    startedAt,
    suppressDirectorMessage: false,
  });

  // 3. Store to the dedup cache (best-effort — never breaks the job). The key
  //    was stamped onto the payload at dispatch time; never recompute here.
  try {
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const dedupeKey = payload["_dedupeKey"];
    if (
      typeof dedupeKey === "string" &&
      isDedupeEligible(job.agentKey) &&
      isCacheableResult(job.agentKey, result)
    ) {
      await storeResult({
        dedupeKey,
        agentKey: job.agentKey,
        siteId: job.siteId,
        result,
        sourceRunId: runId,
        sourceJobId: job.id,
      });
    }
  } catch (e) {
    console.warn("completeJob: storeResult failed", e);
  }
}
```

- [ ] **Step 6: Run the dispatch test to verify it passes**

Run: `npx vitest run src/lib/services/dispatch.test.ts`
Expected: PASS (1 test). If it fails on cleanup FK errors, confirm the cleanup deletes `runs` and `jobs` before `sites`.

- [ ] **Step 7: Wire runAgent (agents.ts) to dispatchAgentJob**

In `src/lib/services/agents.ts`, replace `import { enqueueJob } from "./jobs";` with:

```ts
import { dispatchAgentJob } from "./jobs";
```

Replace the `RunAgentResult` interface with:

```ts
export interface RunAgentResult {
  mode: "inline" | "enqueued" | "cached";
  runId?: number;
  jobId?: number;
  result?: Record<string, unknown>;
  cached?: boolean;
}
```

Add `forceFresh?: boolean;` to the `runAgent` opts object type (after `cycleId?: number;`):

```ts
export async function runAgent(opts: {
  agentKey: string;
  siteId: number;       // required — propagated to runs + jobs
  payload?: Record<string, unknown>;
  cycleId?: number;
  forceFresh?: boolean;
}): Promise<RunAgentResult> {
```

Replace the worker-runtime tail (from `// worker runtime — enqueue` to the end of the function) with:

```ts
  // worker runtime — dispatch (dedup-aware)
  const dispatch = await dispatchAgentJob({
    agentKey: opts.agentKey,
    siteId: opts.siteId,
    payload,
    cycleId: opts.cycleId,
    forceFresh: opts.forceFresh,
  });
  if (dispatch.mode === "cached") {
    return { mode: "cached", runId: dispatch.runId, result: dispatch.result, cached: true };
  }
  return { mode: "enqueued", jobId: dispatch.job.id };
}
```

- [ ] **Step 8: Add forceFresh to RunAgentRequest (schemas.ts)**

In `src/lib/validation/schemas.ts`, replace the `RunAgentRequest` object with:

```ts
export const RunAgentRequest = z.object({
  siteId: z.number().int().positive(),
  cycleId: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  forceFresh: z.boolean().optional(),
});
```

- [ ] **Step 9: Pass forceFresh through the run route**

In `src/app/api/agents/[key]/run/route.ts`, update the `runAgent` call to forward `forceFresh`:

```ts
    const result = await runAgent({
      agentKey: key,
      siteId: site.id,
      payload: enhancedPayload,
      cycleId: parsed.cycleId,
      forceFresh: parsed.forceFresh,
    });
```

- [ ] **Step 10: Wire the Director (director.ts) to dispatchAgentJob**

In `src/lib/services/director.ts`, replace `import { enqueueJob } from "./jobs";` with:

```ts
import { dispatchAgentJob } from "./jobs";
```

Replace the enqueue section (Step 4 of `runDirectorTurn`). Find the block starting `// 4. If actions are present...` and ending with the close of the `if (...) { ... }` that contains the `for (const action of parsed.actions)` loop and the `planApproved` update. Replace that whole block with:

```ts
  // 4. If actions are present and we have permission to execute, dispatch.
  const enqueued: Array<{
    tool: string;
    jobId?: number;
    runId?: number;
    args: Record<string, unknown>;
    cached?: boolean;
  }> = [];
  const cachedResults: Array<{
    agentKey: string;
    result: Record<string, unknown>;
    sourceJobId: number | null;
  }> = [];
  if (parsed.intent === "execute" && parsed.actions && parsed.actions.length > 0) {
    for (const action of parsed.actions) {
      const agentKey = TOOL_TO_AGENT[action.tool];
      if (!agentKey) continue;
      if (!site) {
        console.warn("Director enqueue blocked: conversation has no site", input.conversation.id);
        continue;
      }
      const siteSnapshot = {
        id: site.id,
        key: site.key,
        name: site.name,
        domain: site.domain,
        locale: site.locale,
        niche: site.niche,
        audience: site.audience,
        voiceGuide: site.voiceGuide,
        contentPillars: site.contentPillars,
        bannedPhrases: site.bannedPhrases,
      };
      const dispatch = await dispatchAgentJob({
        agentKey,
        siteId: site.id,
        payload: {
          ...action.args,
          _directorContext: { conversationId: input.conversation.id },
          site: siteSnapshot,
        },
      });
      if (dispatch.mode === "cached") {
        enqueued.push({ tool: action.tool, runId: dispatch.runId, args: action.args, cached: true });
        cachedResults.push({ agentKey, result: dispatch.result, sourceJobId: dispatch.sourceJobId });
      } else {
        enqueued.push({ tool: action.tool, jobId: dispatch.job.id, args: action.args });
      }
    }
    // Mark plan as approved (first execute crosses the approval threshold)
    if (!input.conversation.planApproved) {
      await updateConversation(input.conversation.id, { planApproved: true });
    }
  }
```

Then, **after** the assistant message is appended (after the `const assistantMsg = await appendMessage({...});` call, before the `// Update conversation title/goal` block), insert:

```ts
  // Cache hits resolved synchronously. The replay suppressed its own
  // conversation message to preserve ordering; post the job-completed system
  // messages now, AFTER the assistant "executing" message.
  for (const c of cachedResults) {
    try {
      await appendMessage({
        conversationId: input.conversation.id,
        role: "system",
        content: `${c.agentKey} (cached) completed`,
        payload: {
          kind: "job-completed",
          agentKey: c.agentKey,
          jobId: c.sourceJobId,
          result: c.result,
          cached: true,
        },
      });
    } catch (e) {
      console.warn("Director: cached job-completed append failed", e);
    }
  }
```

- [ ] **Step 11: Typecheck + run the affected service tests**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run src/lib/services/dispatch.test.ts src/lib/services/director.test.ts`
Expected: PASS (dispatch round-trip + the existing Director buildSystemPrompt tests still green).

- [ ] **Step 12: Commit**

```bash
git add src/lib/services/jobs.ts src/lib/services/agents.ts src/lib/validation/schemas.ts "src/app/api/agents/[key]/run/route.ts" src/lib/services/director.ts src/lib/services/dispatch.test.ts
git commit -m "feat(dedup): dispatchAgentJob + applyJobResult; wire Director + runAgent" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Gemini context cache + Director wiring

**Files:**
- Create: `src/lib/services/gemini-cache.ts`
- Test: `src/lib/services/gemini-cache.test.ts`
- Modify: `src/lib/services/director.ts` (use `pickModel` + `getOrCreateCachedContent` + `newTraceId` in the Gemini call)

- [ ] **Step 1: Write the failing guard tests**

Create `src/lib/services/gemini-cache.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getOrCreateCachedContent } from "./gemini-cache";

const ORIGINAL_SWITCH = process.env.GEMINI_CONTEXT_CACHE;
const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_SWITCH === undefined) delete process.env.GEMINI_CONTEXT_CACHE;
  else process.env.GEMINI_CONTEXT_CACHE = ORIGINAL_SWITCH;
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
});

describe("getOrCreateCachedContent", () => {
  it("returns null and never calls fetch when GEMINI_CONTEXT_CACHE=off", async () => {
    process.env.GEMINI_CONTEXT_CACHE = "off";
    process.env.GEMINI_API_KEY = "k";
    const fetchSpy = vi.spyOn(global, "fetch");
    const out = await getOrCreateCachedContent({
      model: "gemini-flash-latest",
      systemInstruction: "x",
    });
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_CONTEXT_CACHE;
    delete process.env.GEMINI_API_KEY;
    const out = await getOrCreateCachedContent({
      model: "gemini-flash-latest",
      systemInstruction: "x",
    });
    expect(out).toBeNull();
  });

  it("returns null (no fetch) for a sub-threshold system instruction", async () => {
    delete process.env.GEMINI_CONTEXT_CACHE;
    process.env.GEMINI_API_KEY = "k";
    const fetchSpy = vi.spyOn(global, "fetch");
    const out = await getOrCreateCachedContent({
      model: "gemini-flash-latest",
      systemInstruction: "short prompt below the minimum cache size",
    });
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/services/gemini-cache.test.ts`
Expected: FAIL — cannot resolve `./gemini-cache`.

- [ ] **Step 3: Implement gemini-cache.ts**

Create `src/lib/services/gemini-cache.ts`:

```ts
/**
 * Explicit Gemini context caching for stable, reused system prompts (the
 * Director's). Creates a `cachedContents` resource and reuses its name across
 * calls, fronted by an in-memory map (warm on Vercel Fluid Compute) and a
 * kv_settings registry (survives cold starts).
 *
 * Free tier commonly rejects explicit cache creation and stable prompts may
 * fall under the per-model minimum token threshold — both degrade silently to
 * null, and the caller falls back to an inline systemInstruction.
 *
 * Kill-switch: GEMINI_CONTEXT_CACHE=off.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";
import { logEvent } from "@/lib/observability/logger";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/cachedContents";

// Gemini rejects cachedContents below a per-model minimum (~1k+ tokens). Skip
// proactively so we never POST a guaranteed-reject every Director turn; free
// implicit caching covers small prompts. ~4 chars/token => 4096 chars ~ 1k tok.
const MIN_SYSTEM_INSTRUCTION_CHARS = 4096;

interface CacheRegistryEntry {
  name: string;
  expiresAtMs: number;
}

const memCache = new Map<string, CacheRegistryEntry>();

function cacheEnabled(): boolean {
  return process.env.GEMINI_CONTEXT_CACHE?.trim().toLowerCase() !== "off";
}

function keyHash(model: string, systemInstruction: string): string {
  return createHash("sha256")
    .update(`${model} ${systemInstruction}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Return a usable cachedContents name, or null if caching is off/unavailable.
 * Never throws.
 */
export async function getOrCreateCachedContent(opts: {
  model: string;
  systemInstruction: string;
  ttlSeconds?: number;
}): Promise<string | null> {
  if (!cacheEnabled()) return null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // Sub-threshold prompts can't be cached — fall back to inline (no I/O).
  if (opts.systemInstruction.length < MIN_SYSTEM_INSTRUCTION_CHARS) return null;

  const ttl = opts.ttlSeconds ?? 3600;
  const hash = keyHash(opts.model, opts.systemInstruction);
  const kvKey = `gemini.cache.${hash}`;
  const now = Date.now();

  // 1. In-memory front (warm instance reuse)
  const mem = memCache.get(hash);
  if (mem && mem.expiresAtMs > now + 60_000) return mem.name;

  // 2. DB registry
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(kvSettings)
      .where(eq(kvSettings.key, kvKey))
      .limit(1);
    const val = row?.value as CacheRegistryEntry | undefined;
    if (val && typeof val.name === "string" && val.expiresAtMs > now + 60_000) {
      memCache.set(hash, val);
      return val.name;
    }
  } catch (e) {
    console.warn("gemini-cache: registry read failed", e);
  }

  // 3. Create a new cachedContents resource
  try {
    const modelPath = opts.model.startsWith("models/") ? opts.model : `models/${opts.model}`;
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelPath,
        systemInstruction: { parts: [{ text: opts.systemInstruction }] },
        ttl: `${ttl}s`,
      }),
    });
    if (!res.ok) {
      // Free tier / under-minimum-tokens — degrade silently to inline.
      logEvent({ kind: "gemini.cache.skip", model: opts.model, status: String(res.status) });
      return null;
    }
    const data = (await res.json()) as { name?: string };
    if (!data.name) return null;
    const entry: CacheRegistryEntry = { name: data.name, expiresAtMs: now + ttl * 1000 };
    memCache.set(hash, entry);
    try {
      const db = getDb();
      await db
        .insert(kvSettings)
        .values({ key: kvKey, value: entry })
        .onConflictDoUpdate({ target: kvSettings.key, set: { value: entry, updatedAt: new Date() } });
    } catch (e) {
      console.warn("gemini-cache: registry write failed", e);
    }
    logEvent({ kind: "gemini.cache.create", model: opts.model, name: data.name });
    return data.name;
  } catch (e) {
    console.warn("gemini-cache: create failed", e);
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/services/gemini-cache.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the Director's Gemini call**

In `src/lib/services/director.ts`, update the imports. Replace:

```ts
import { completeJson, GeminiError } from "./gemini";
```
with:
```ts
import { completeJson, GeminiError } from "./gemini";
import { pickModel } from "./model-router";
import { getOrCreateCachedContent } from "./gemini-cache";
import { newTraceId } from "@/lib/observability/logger";
```

Then, in `runDirectorTurn` Step 3 (the `// 3. Ask Gemini` block), replace the `try { const { data } = await completeJson<DirectorResponse>(transcript, { systemInstruction: buildSystemPrompt(site), ... }); parsed = data; }` portion so the model, cache handle, task, and traceId are wired in. Specifically, replace:

```ts
  // 3. Ask Gemini
  let parsed: DirectorResponse;
  try {
    const { data } = await completeJson<DirectorResponse>(transcript, {
      systemInstruction: buildSystemPrompt(site),
      temperature: 0.4,
      maxOutputTokens: 2048,
      responseSchema: {
```

with:

```ts
  // 3. Ask Gemini
  const model = pickModel("director");
  const sysPrompt = buildSystemPrompt(site);
  const traceId = newTraceId();
  // Best-effort explicit context cache for the (stable) system prompt; null =>
  // inline systemInstruction (free tier / under min tokens / kill-switch).
  const cachedContent = await getOrCreateCachedContent({
    model,
    systemInstruction: sysPrompt,
    ttlSeconds: 3600,
  }).catch(() => null);
  let parsed: DirectorResponse;
  try {
    const { data } = await completeJson<DirectorResponse>(transcript, {
      model,
      task: "director",
      traceId,
      ...(cachedContent ? { cachedContent } : { systemInstruction: sysPrompt }),
      temperature: 0.4,
      maxOutputTokens: 2048,
      responseSchema: {
```

(The rest of the `responseSchema` object and the `});` that closes `completeJson` stay exactly as they are.)

- [ ] **Step 6: Typecheck + run Director tests**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run src/lib/services/director.test.ts src/lib/services/gemini-cache.test.ts`
Expected: PASS (existing Director tests + new cache guard tests). The Director's live Gemini path is covered by typecheck + the Task 9 build + manual smoke (not a live test — free tier is nondeterministic).

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/gemini-cache.ts src/lib/services/gemini-cache.test.ts src/lib/services/director.ts
git commit -m "feat(gemini): explicit context cache for Director (graceful fallback)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Document the new env controls

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the cost/model controls section**

In `.env.example`, insert the following block **between** the `CONNECTION_ENCRYPTION_KEY=` line and the `# --- Worker-only env (NOT used by Vercel) ---...` comment line:

```bash

# --- Cost / model controls (Director + result dedup) --------------------
# GEMINI_API_KEY (see worker block below) is ALSO read by the Director on
# Vercel for planning calls. Override the Director's model here (default:
# gemini-flash-latest, free tier):
GEMINI_MODEL_DIRECTOR=
# Explicit Gemini context caching for the Director system prompt. "off"
# disables; unset/anything else enables with graceful fallback (free tier may
# reject cache creation — the Director degrades to an inline system prompt).
GEMINI_CONTEXT_CACHE=
# Result dedup: replay a finished agent result instead of re-running the worker
# when an identical request recurs. "off" disables; unset = on. Per-agent TTLs
# live in src/lib/services/result-cache.ts (research / idea-generation /
# backlink 7d, content-writing 30d, qa / seo-optimization disabled).
RESULT_DEDUP=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document GEMINI_MODEL_DIRECTOR, GEMINI_CONTEXT_CACHE, RESULT_DEDUP" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors. (If eslint flags an unused import you added — e.g. a leftover `enqueueJob` import — remove it and re-run.)

- [ ] **Step 3: Full test suite (live DB)**

Run: `npm test`
Expected: all suites PASS, including the new logger / model-router / gemini / gemini-cost / gemini-cache / result-cache / dispatch tests, and all pre-existing suites. Every new live-DB test cleans up after itself.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds (Next.js 16 compiles all routes; the changed run route + Director + jobs compile).

- [ ] **Step 5: Verify the 17th table on Neon directly (F-034)**

Run:
```bash
node -e "require('dotenv').config({path:'.env.local'});const {neon}=require('@neondatabase/serverless');(async()=>{const sql=neon(process.env.DATABASE_URL);const r=await sql`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'`;const t=await sql`SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='result_cache'`;console.log('public tables:', r[0].n, '| result_cache present:', t.length===1);})().catch(e=>{console.error(e);process.exit(1)});"
```
Expected: `public tables: 17 | result_cache present: true` (17 = the prior 16 + result_cache).

- [ ] **Step 6: (Optional) Manual end-to-end dedup smoke**

The automated dedup round-trip in `src/lib/services/dispatch.test.ts` is the e2e proof (miss → store → cached replay → forceFresh bypass). For a manual HTTP check against a running dev server (`npm run dev`), POST the same `backlink` request twice and confirm the second response has `"mode":"cached"`:

```bash
# (requires an existing site id; replace 1). First call enqueues:
curl -s -X POST http://localhost:3000/api/agents/backlink/run -H "Content-Type: application/json" -d '{"siteId":1,"payload":{"targetSite":"example.org","context":"hi","ourValue":"v"}}'
# Simulate the worker finishing that job via the complete endpoint, then call
# again with the identical body — expect {"mode":"cached",...}. Use
# {"...,"forceFresh":true} to bypass.
```

- [ ] **Step 7: Confirm a clean tree**

Run: `git status --porcelain`
Expected: empty (all task commits landed; `.env.local` is git-ignored and must NOT appear).

---

## Done criteria

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all green.
- `result_cache` present on Neon; `/api/db-status` `EXPECTED_TABLES` lists 17.
- Real worker path unchanged (byte-identical runs row, notification, Director message); dedup hits replay via `applyJobResult`; every new path kill-switched (`RESULT_DEDUP=off`, `GEMINI_CONTEXT_CACHE=off`, `GEMINI_MODEL_DIRECTOR`) and fail-safe.
- 9 commits (one per task), each ending with the Co-Authored-By trailer.
