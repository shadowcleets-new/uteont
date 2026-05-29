# Cost-Efficiency Hardening — Design

**Date:** 2026-05-29
**Status:** Approved (operator said "go", 2026-05-29)
**Author:** Director / operator pair
**Spec scope:** TS-side (Vercel) cost + observability hardening. No worker (Python) changes.
**Stacked on:** `worktree-site-context-foundation` @ `3a6b84d` (needs the site snapshot in `jobs.payload.site`, the `completeJob` persistence switch, and the `sites` table).

---

## Motivation

The operator asked to "reduce the number of requests to the AI as much as possible
and still gain the same level of output" — i.e. raise cost-efficiency to the
fullest without degrading quality — and then to ship "the highest ROI for the
least work" across three named levers: **context caching, routing cheap steps to
Flash/local, and result dedup**, with token/cost logging folded in.

A grounding pass on the actual code corrected the obvious-but-wrong framing:

- The **Director** (the only TS-side LLM caller, `src/lib/services/director.ts`)
  already runs on the **free tier** `gemini-flash-latest` (1500 req/day, 1M
  tokens/day). There is no expensive TS-side model call to "route down."
- The genuinely expensive model usage (Gemini 3.1 Pro via AI Studio) lives in the
  **Python worker**, reached only by *enqueuing a job*. That is out of TS scope —
  but it is exactly why **result dedup is the highest-ROI TS-side lever**: a dedup
  hit at *enqueue time* skips an entire worker run, which is where the real cost is.

So the ROI ranking for this spec is: **(1) result dedup** (skips worker runs),
**(2) token/cost observability** (you can't optimize what you can't see),
**(3) context caching** (cuts the Director's per-turn token footprint / latency),
**(4) model routing** (formalizes the Flash default + an env override + a seam for
future local/cheap sub-steps).

### Hard constraint (operator, verbatim intent)

> "Ensure there are no bugs or gaps in the code. Also ensure this doesn't cost any
> issues in the whole workflow or the pipeline."

Every decision below is therefore **additive and reversible**: a cache miss / a
disabled switch reproduces today's behavior byte-for-byte, and every new path has
a kill-switch.

---

## Decisions made up front

| # | Question | Decision |
|---|---|---|
| 1 | Scope | TS-side, **full** — includes *explicit* Gemini context caching, not only implicit |
| 2 | Dedup reach | **All worker agents incl. creative** (research, idea-generation, content-writing, outreach) + a `forceFresh` escape hatch |
| 3 | Deterministic fn agents (qa, seo) | Dedup machinery *covers* them but the default per-agent TTL is **0 (disabled)** — recomputing a pure-Python deterministic check is cheaper than a cache lookup + replay, and replaying them would add notify/Director side-effects they never emit |
| 4 | Side-effect fidelity on a cache hit | A hit must reproduce the **worker** completion side-effects for the *new* cycle (run row + agent-specific persist + Telegram notify + Director system message), only skipping the expensive agent call |
| 5 | Staleness on profile edit | The dedupe key folds a **site-profile signature** (voice/niche/audience/banned/pillars/locale/domain) so editing a site's profile naturally invalidates its cache — no stale content |
| 6 | Caching success only | Only successful, **non-degenerate** results are cached (empty keyword lists / empty drafts are never stored) |
| 7 | Explicit context cache on free tier | Best-effort: attempt `cachedContents`; on any error or sub-threshold input, **fall back to inline `systemInstruction`** (today's behavior). Free-tier keys that can't create caches simply fall back |
| 8 | Concurrency / in-flight dupes | **Out of scope** — two identical requests racing before the first completes both run. Documented fast-follow. No correctness impact, only a missed save |

---

## 1. Architecture overview

Four additive workstreams, no existing table altered, one new table:

1. **Observability logger** (`src/lib/observability/logger.ts`) — structured
   JSON-to-stdout events with an optional `traceId`. Logging is wrapped so it can
   never throw into a caller. `model.call` events carry token counts + estimated
   cost; `result_cache.*` events carry hit/miss/store.
2. **Model router** (`src/lib/services/model-router.ts`) — `pickModel(task)` with
   env overrides (`GEMINI_MODEL_DIRECTOR`), default `gemini-flash-latest`. A thin
   seam; today only the `director` task exists.
3. **Gemini context caching** (`src/lib/services/gemini-cache.ts` + additive
   `cachedContent` support in `src/lib/services/gemini.ts`) — explicit
   `cachedContents` for the Director's large, stable, per-site `systemInstruction`;
   hash-keyed registry in `kv_settings` + an in-memory front for warm Fluid-Compute
   instances; graceful fallback to inline on any error.
4. **Result dedup** (`src/lib/services/result-cache.ts` + a new `dispatchAgentJob`
   layer + `applyJobResult` extraction in `jobs.ts` + new `result_cache` table) —
   the ROI centerpiece. Computes a content-addressed key per dispatch; on a hit,
   replays the cached result's side-effects for the new cycle and **skips the job**;
   on a miss, enqueues as today and stamps the key so completion populates the cache.

```
                       ┌──────────────── dispatchAgentJob(input) ───────────────┐
 Director.execute ───▶ │ eligible & RESULT_DEDUP=on & !forceFresh ?             │
 runAgent(worker) ───▶ │   key = dedupeKey(agent, siteId, payload)              │
                       │   hit  → applyJobResult(replay) → {mode:"cached"}      │
                       │   miss → payload._dedupeKey = key ; enqueueJob()       │
                       └────────────────────────────────────────────────────────┘
 worker → completeJob(jobId,result):
   markDone → applyJobResult(...) → if payload._dedupeKey & cacheable → storeResult()
```

`enqueueJob` itself is **unchanged** (still a pure insert) — the dedup decision is
a new layer above it, so its callers and contract are untouched except where we
deliberately swap them to `dispatchAgentJob`.

---

## 2. Data model

### `result_cache` (new — the only schema change)

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `dedupeKey` | text **unique** NOT NULL | sha256 hex; content-addressed (see §5) |
| `agentKey` | text NOT NULL | e.g. `research`, `content-writing` |
| `siteId` | integer NOT NULL → `sites.id` ON DELETE CASCADE | cache dies with its site |
| `result` | jsonb NOT NULL | the cached agent output, verbatim |
| `sourceRunId` | integer NULL | the run that first produced this result |
| `sourceJobId` | integer NULL | the job that first produced this result |
| `hitCount` | integer NOT NULL default 0 | incremented on each replay (observability) |
| `createdAt` | timestamptz NOT NULL defaultNow | (re)population time |
| `expiresAt` | timestamptz NOT NULL | `createdAt + TTL(agentKey)`; lazy-expired on read |

Indexes: `unique(dedupe_key)`, `(agent_key, site_id)`, `(expires_at)`.

Conventions match house style (serial PK, `timestamp(..., { withTimezone: true })`,
jsonb, snake_case columns ↔ camelCase fields). Migration is `drizzle/0005_*.sql`.
`/api/db-status` `EXPECTED_TABLES` goes **16 → 17** (insert `"result_cache"`).

Storage is bounded: keys are de-duplicated (`ON CONFLICT (dedupe_key) DO UPDATE`),
TTLs are short for cheap agents, and a pruning cron is a documented fast-follow
(lazy read-time expiry is correct without it).

### `kv_settings` reuse (no schema change)

The Gemini cache registry stores rows keyed `gemini.cache.<sha256(model+systemInstruction)>`
→ `{ name: "cachedContents/…", model, expiresAt }`. Reuses the existing
`kv_settings { key pk, value jsonb, updatedAt }` table.

---

## 3. Observability logger — `src/lib/observability/logger.ts`

```ts
export function newTraceId(): string                       // crypto.randomUUID()
export function logEvent(event: string, fields?: Record<string, unknown>): void
export async function timed<T>(event: string, fields: Record<string, unknown>,
                               fn: () => Promise<T>): Promise<T>
```

- `logEvent` emits one line: `console.log(JSON.stringify({ ts, event, ...fields }))`.
  Wrapped in try/catch — **logging never throws**. Truncates obviously huge string
  fields defensively.
- `timed` records `latencyMs` and an `ok`/`error` outcome around `fn`, logs, and
  **rethrows** the original error (it measures, it doesn't swallow business errors).
- No PII / secrets: callers pass token *counts* and model names, never prompt text
  or payload bodies. (Honors F-031.)

This is the logger *subset* of the previously-designed traceId hardening; the
DB-column persistence of traceId stays deferred.

---

## 4. Model router — `src/lib/services/model-router.ts`

```ts
export type ModelTask = "director";
export function pickModel(task: ModelTask): string;
```

- `director` → `process.env.GEMINI_MODEL_DIRECTOR ?? "gemini-flash-latest"`.
- Pure, synchronous, no I/O. `director.ts` calls `pickModel("director")` and passes
  the result as `opts.model` (today it relies on `gemini.ts`'s `DEFAULT_MODEL`; this
  makes the choice explicit and overridable without code change).
- `DEFAULT_MODEL` in `gemini.ts` stays as the ultimate fallback (unchanged).

---

## 5. Result dedup — the ROI centerpiece

### 5.1 `src/lib/services/result-cache.ts`

```ts
export const TTL_SECONDS_BY_AGENT: Record<string, number> = {
  "research": 7*24*3600, "idea-generation": 7*24*3600,
  "content-writing": 30*24*3600, "backlink": 7*24*3600,
  "qa": 0, "seo-optimization": 0,            // 0 ⇒ dedup disabled (see Decision 3)
};
export function dedupEnabled(): boolean;     // RESULT_DEDUP !== "off"
export function isDedupeEligible(agentKey: string): boolean;        // ttl > 0
export function computeDedupeKey(agentKey: string, siteId: number,
                                 payload: Record<string, unknown>): string;
export function isCacheableResult(agentKey: string, result: unknown): boolean;
export async function lookupResult(dedupeKey: string)
  : Promise<{ result: Record<string, unknown>; sourceRunId: number|null } | null>;
export async function storeResult(input: { dedupeKey; agentKey; siteId;
  result; sourceRunId?; sourceJobId?; ttlSeconds }): Promise<void>;
export async function bumpHitCount(dedupeKey: string): Promise<void>;
```

**`computeDedupeKey`** (deterministic, must match at lookup *and* implied store):
1. Shallow-clone `payload`; delete volatile keys: `_directorContext`, `_dedupeKey`,
   `forceFresh`, and `site`.
2. Derive a **site-profile signature**: from `payload.site` (if present) pick the
   output-affecting fields `{ locale, domain, niche, audience, voiceGuide,
   contentPillars, bannedPhrases }`, canonicalize (recursive key sort), hash.
   Absent `site` ⇒ empty signature.
3. Canonicalize the remaining payload (recursive key sort → stable JSON).
4. `key = sha256(`${agentKey} ${siteId} ${profileSig} ${canonical}`)`.

Canonicalization sorts **object keys** recursively but **preserves array order**
(`["a","b"]` ≠ `["b","a"]`) — reordered inputs miss rather than risk a wrong reuse
(safe direction: a miss only costs a fresh run, never serves the wrong result).

Folding the profile signature in (Decision 5) means a voice/niche edit changes the
key → cache miss → fresh run → **no stale content**, while leaving the redundant
`site.id`/`site.name`/etc. out of the volatile-stripped body avoids spurious misses.

**`isCacheableResult`** guards against caching junk: `research` ⇒ non-empty
`result.keywords[]`; `idea-generation` ⇒ non-empty `result.ideas[]`;
`content-writing` ⇒ truthy `result.title` && `result.body`; `backlink` ⇒ truthy
draft body. Anything else ⇒ not cacheable (so it re-runs next time).

**`lookupResult`** returns a row only if `expiresAt > now()` (lazy expiry). **Store**
is `INSERT … ON CONFLICT (dedupe_key) DO UPDATE SET result, expiresAt, sourceRunId,
sourceJobId, createdAt=now, hitCount=0` — re-populates cleanly after expiry or when
the upstream result changes. All three swallow + log DB errors (a cache failure must
never break a dispatch or a completion).

Kill-switch: `RESULT_DEDUP=off` ⇒ `dedupEnabled()` false ⇒ every path no-ops to
today's behavior.

### 5.2 `applyJobResult` extraction in `src/lib/services/jobs.ts`

`completeJob`'s steps 2–5 (write run row → agent-specific persist → notify → Director
system message) are extracted **verbatim in behavior** into:

```ts
export async function applyJobResult(input: {
  agentKey: string; siteId: number; cycleId: number | null;
  payload: Record<string, unknown>; result: Record<string, unknown>;
  jobId?: number | null;          // runs.job_id — null on a replay (no job ran)
  notifyJobId?: number;           // id used in Telegram text/buttons; replay passes sourceJobId ?? 0
  startedAt?: Date;
  suppressDirectorMessage?: boolean;  // replay-from-Director sets true (see §5.4 ordering)
}): Promise<{ runId: number }>;
```

- `completeJob` keeps step 1 (mark job `done`) then calls `applyJobResult({…,
  jobId: job.id, notifyJobId: job.id, startedAt: job.claimedAt ?? job.createdAt})`
  — **identical output to today** (verified against current lines 103–160;
  `suppressDirectorMessage` defaults false).
- A cache **replay** calls `applyJobResult({…, jobId: null, notifyJobId:
  sourceJobId ?? 0, startedAt: new Date()})`. Run rows with `jobId === null`
  already exist today (inline fn runs), so this is not a new shape. The replayed
  run's `result` is the cached result verbatim, so `persistResearchKeywords` /
  `persistIdeas` / `persistArticle` produce the right rows for the *new* cycle.
- **null-jobId safety:** the Telegram template (`notify-job.ts`) interpolates the
  id into text (`(job N)`) and callback data (`approve_top:keywords:N:5`). The
  replay therefore passes `notifyJobId` (the cached `sourceJobId`, or `0`) — never
  `null` — so messages/buttons stay well-formed. The `runs.job_id` column is the
  separate, honest `null`.

`applyJobResult` is only ever reached for **worker** agents (fn agents are
TTL-0 / dedup-disabled), so its notify + Director-message side-effects always match
the worker completion profile — they are never grafted onto an inline fn agent that
wouldn't normally emit them. (This is the resolution of the side-effect-profile
mismatch found during grounding.)

### 5.3 `dispatchAgentJob` layer (new, in `jobs.ts`)

```ts
export type DispatchResult =
  | { mode: "enqueued"; job: typeof jobs.$inferSelect }
  | { mode: "cached"; runId: number; result: Record<string, unknown> };

export async function dispatchAgentJob(input: EnqueueJobInput): Promise<DispatchResult>;
```

- If `dedupEnabled() && isDedupeEligible(agentKey) && !payload.forceFresh`:
  compute key; `lookupResult`. **Hit** ⇒ `applyJobResult` replay (always with
  `suppressDirectorMessage: true` — the Director re-posts in order, §5.4), wrapped in
  try/catch → `bumpHitCount` → log `result_cache.hit` → `{ mode:"cached", runId,
  result }`. If the replay *throws*, fall through to enqueue a real job (fail-safe —
  never lose the work). **Miss** ⇒ set `payload._dedupeKey = key`, log
  `result_cache.miss`.
- Then `enqueueJob(input)` as today → `{ mode:"enqueued", job }`.
- `completeJob`: after the run row exists, if `payload._dedupeKey` &&
  `isDedupeEligible` && `isCacheableResult` ⇒ `storeResult({ dedupeKey, agentKey,
  siteId, result, sourceRunId: run.id, sourceJobId: job.id, ttlSeconds })`. The key
  is the one stamped at dispatch — **never recomputed**, so lookup/store can't drift.

### 5.4 Wiring the two enqueue entry points

- **`runAgent` (worker branch)** swaps `enqueueJob` → `dispatchAgentJob`. On
  `"enqueued"` returns `{ mode:"enqueued", jobId }`; on `"cached"` returns
  `{ mode:"cached", runId, result }`. The fn (inline) branch is **unchanged**.
- **`director.ts` execute loop** swaps `enqueueJob` → `dispatchAgentJob`, and the
  local `enqueued` list type widens to allow cached entries (`jobId?`, `runId?`,
  `cached?: true`). On `"enqueued"` pushes `{ tool, jobId, args }` as today; on
  `"cached"` pushes `{ tool, runId, args, cached: true }`.
  **Message ordering:** the replay suppresses its own in-conversation message (§5.3),
  so after the assistant "dispatching" message is appended (step 5, unchanged), the
  Director appends one `system` message per cached result — `{ kind:"job-completed",
  agentKey, result, cached:true }`. Order stays [user] → [assistant "dispatching"] →
  [system "…completed (cached)"]; the next Director turn reports on it exactly like
  the async worker path. (Telegram notify still fires from `applyJobResult`, matching
  the worker path.) `planApproved` still flips on the first `execute` turn regardless
  of hit/miss.
- **`RunAgentResult`** gains the `"cached"` mode (a third union value). Callers are
  backward-compatible: `/api/agents/[key]/run` just `NextResponse.json(result)`;
  `/api/agents/run-redirect` ignores the return. (Both verified.)

### 5.5 `forceFresh` escape hatch

Read from `payload.forceFresh === true`. The `/api/agents/[key]/run` route passes a
body-level `forceFresh` into the payload (additive optional field in
`RunAgentRequest`). When set, dispatch skips the lookup *and* does not stamp a key
(so the fresh run also won't overwrite an existing cache entry). Stripped from the
dedupe key so its presence never changes addressing.

---

## 6. Gemini context caching

### 6.1 Additive `cachedContent` support — `src/lib/services/gemini.ts`

- `GeminiOptions` gains optional `cachedContent?: string`, `task?: string`,
  `traceId?: string` (all additive; existing callers unaffected).
- When `cachedContent` is set, the request body includes `cachedContent: <name>` and
  **omits** `systemInstruction` (the cache holds it); model must equal the cache's
  model.
- `GeminiResult.usage` gains `cachedTokens` from `usageMetadata.cachedContentTokenCount`.
- After every call, emit a `model.call` log event: `{ traceId?, task?, model,
  promptTokens, completionTokens, cachedTokens, totalTokens, estCostUsd, latencyMs,
  finishReason }`. Cost via a small `PRICE_PER_1M_TOKENS` table (input/output/cached);
  unknown or free-tier models ⇒ `estCostUsd: 0` but token counts still logged
  (quota visibility). The cost math is a pure exported helper (`estimateCostUsd`) so
  it is unit-testable without network.

### 6.2 `src/lib/services/gemini-cache.ts`

```ts
export async function getOrCreateCachedContent(input: {
  model: string; systemInstruction: string; ttlSeconds?: number;
}): Promise<string | null>;   // resource name, or null ⇒ caller uses inline systemInstruction
```

- `GEMINI_CONTEXT_CACHE=off` ⇒ return `null` immediately.
- Hash = `sha256(model + " " + systemInstruction)`. Check in-memory map (warm
  instance) → then `kv_settings` row `gemini.cache.<hash>` (valid if `expiresAt > now`).
- Below a conservative size threshold (won't meet the model's min cache tokens) ⇒
  return `null` (rely on free implicit caching).
- Otherwise `POST /v1beta/cachedContents { model, systemInstruction, ttl }` → persist
  `{ name, model, expiresAt }` to `kv_settings` + in-memory → return `name`.
- **Every failure path returns `null`** (logged), so the Director always degrades to
  today's inline-`systemInstruction` call. On a free-tier key that can't create
  caches, this is a transparent no-op.

### 6.3 Director wiring

`runDirectorTurn`: `model = pickModel("director")`; attempt `cacheName =
getOrCreateCachedContent({ model, systemInstruction: buildSystemPrompt(site), ttlSeconds: 3600 })`.
If `cacheName` ⇒ `completeJson(transcript, { model, cachedContent: cacheName, … })`;
else ⇒ `completeJson(transcript, { model, systemInstruction: buildSystemPrompt(site), … })`
(current call, unchanged). Per-site `systemInstruction` ⇒ per-site cache via the hash;
a profile edit changes the text ⇒ new hash ⇒ new cache (old expires by TTL). No
stale system prompt.

---

## 7. Migration, testing, error handling

### Migration `drizzle/0005_result_cache.sql`

Single phase: `CREATE TABLE result_cache (…)` + the three indexes. No backfill, no
changes to existing tables ⇒ no two-phase dance. **Verify directly on Neon** after
`db:migrate` (F-034 — never trust the "applied" report), then bump `EXPECTED_TABLES`.

### Tests (Vitest; DB tests use random keys + clean up — live shared Neon)

- `observability/logger.test.ts` — `logEvent` never throws (even on a circular
  field); `timed` returns the value + rethrows on error; `newTraceId` unique.
- `services/model-router.test.ts` — default vs `GEMINI_MODEL_DIRECTOR` override.
- `services/gemini-cost.test.ts` — `estimateCostUsd` math; usage mapping incl.
  `cachedContentTokenCount` (pure, no network).
- `services/result-cache.test.ts` — `computeDedupeKey` stable across key reordering;
  volatile keys (`_directorContext`/`forceFresh`/`site.id`) don't change it; a
  voice/niche edit *does*; `isCacheableResult` guards; `storeResult`→`lookupResult`
  round-trip; expiry respected; `ON CONFLICT` re-populate.
- `services/dispatch.test.ts` (the critical one) — miss enqueues + stamps
  `_dedupeKey`; completion `storeResult`s; a second identical dispatch **hits**,
  replays (new run row, agent rows persisted for the new cycle, **no new job**),
  bumps `hitCount`; `forceFresh` bypasses; `RESULT_DEDUP=off` bypasses; a TTL-0
  agent (`qa`) never dedups; `applyJobResult` via `completeJob` is byte-identical to
  the pre-refactor behavior (snapshot the run row + persisted rows). Prefer
  `backlink` as the round-trip agent (eligible, **no** typed-table persistence) to
  keep live-DB cleanup to `runs` + `result_cache` + the throwaway site; cover the
  `content-writing`/`research` persist linkage in a separate, well-cleaned case.
- `services/gemini-cache.test.ts` — kill-switch returns null; sub-threshold returns
  null; hash keying; create-failure ⇒ null (mocked fetch).
- Existing suites must stay green (esp. `director.test.ts`, agent-run tests).

### Error handling specifics

- Cache lookup/store/bump DB error ⇒ logged, swallowed; dispatch/completion proceed
  exactly as today (miss-equivalent).
- `cachedContents` create error / quota / free-tier rejection ⇒ `null` ⇒ inline
  systemInstruction.
- `applyJobResult` keeps the existing per-step `try/catch` (persist failure must not
  roll back the run row or job-done status; notify + Director msg are best-effort).
- A replay that itself throws inside `applyJobResult` ⇒ the dispatch falls through to
  enqueue a real job (fail-safe: never lose the work).

---

## 8. Out of scope (deferred)

- **In-flight idempotency** (dedupe concurrent identical dispatches before the first
  completes) — a short-lived "pending key" claim. Fast-follow; no correctness impact.
- **traceId DB-column persistence** across runs/jobs/messages — the logger ships;
  column wiring stays deferred.
- **Worker-side cost work** (routing Pro→Flash/local, worker-side dedup, Ollama).
- **Expired-row pruning cron** for `result_cache` (lazy read-time expiry suffices).
- **Per-agent TTL admin UI** — TTLs are code constants + env overrides for now.

---

## 9. Safety / no-disruption guarantees (maps to the operator's hard constraint)

- Every change is **additive**; one new table; **zero** existing-table alterations.
- **Cache miss ≡ today.** Disabled switches (`RESULT_DEDUP=off`,
  `GEMINI_CONTEXT_CACHE=off`) ≡ today.
- **Success-only + non-degenerate-only** caching; **profile-aware** keys ⇒ no stale
  content; **per-agent TTL** bounds staleness; **`forceFresh`** overrides on demand.
- Context caching **always** has a working fallback (inline systemInstruction).
- `enqueueJob` contract **unchanged**; `completeJob` output **unchanged** on the
  real-completion path (proven by the extraction being behavior-preserving + a
  snapshot test).
- Logging **never throws**; cache I/O **never throws** into business paths.

---

## 10. Acceptance criteria

Done when:

- A second identical worker-agent dispatch (same args + same site profile, within
  TTL, `forceFresh` unset) creates **no new job**, produces a new run + the right
  persisted rows for the new cycle, posts the Director "completed" message, and
  increments `result_cache.hitCount` — verifiable in the DB.
- Editing the site's `voiceGuide` (or niche/audience/banned/pillars) makes the next
  dispatch **miss** (fresh run).
- `RESULT_DEDUP=off` and `GEMINI_CONTEXT_CACHE=off` each fully restore current
  behavior.
- The Director still plans on `gemini-flash-latest`; every model call logs a
  `model.call` event with token counts (and `cachedTokens` when a cache is used).
- `/api/db-status` reports 17/17 tables; migration verified on Neon.
- Typecheck, eslint, full Vitest suite, and `next build` all green.

---

## 11. Task breakdown (preview — formalized in the plan)

1. Observability logger (TDD).
2. Model router (TDD).
3. `gemini.ts`: `cachedContent` + `cachedTokens` + `model.call` logging + price
   table / `estimateCostUsd` (TDD on the pure helper).
4. `result_cache` schema + `0005` migration; verify on Neon; bump `EXPECTED_TABLES`.
5. `result-cache.ts` service (TDD).
6. **[highest care]** `applyJobResult` extraction + `dispatchAgentJob` + dedup wiring
   in `runAgent` + `director.ts`; `RunAgentResult` `"cached"` mode; `forceFresh` on
   the run route (TDD incl. behavior-preserving snapshot of `completeJob`).
7. `gemini-cache.ts` + Director wiring (TDD on pure parts).
8. `.env.example` docs (`GEMINI_MODEL_DIRECTOR`, `GEMINI_CONTEXT_CACHE`,
   `RESULT_DEDUP`, optional per-agent TTL note).
9. Final verification: typecheck, eslint, full Vitest, `next build`, Neon table
   check, e2e dedup smoke.
