# UTEONT — Holistic Improvement Plan

> A standalone, execution-ready roadmap. Every task is a self-contained recipe:
> the problem, the exact files, the data model, a test-first build sequence, and
> an acceptance gate. Written so any model — including a small one — can pick up a
> single task and finish it without re-deriving context.

---

## 0. How to execute any task in this plan (read once)

These are the project's non-negotiable rules. They override anything below if they conflict.

### 0.1 The execution loop (every code task)
1. **Read first.** This is Next.js 16 with breaking changes — before writing app code, read the relevant guide in `node_modules/next/dist/docs/`. Read `AGENTS.md` + `CLAUDE.md` + `.claude/active_context.md`.
2. **Test first (TDD).** Write a failing test, run it, watch it fail for the right reason, then write minimal code to pass. Pure logic → `*.test.ts` next to the file. Never write production code before a failing test.
3. **Wire it.** Connect the new unit into the service/route/UI.
4. **Verify (in this exact order), and do not claim done until all pass:**
   ```powershell
   npx vitest run <the new test files>
   npx tsc --noEmit
   npx eslint <changed files>
   $env:DATABASE_URL="postgres://u:p@localhost:5432/db"; $env:AUTH_SECRET="ci"; npx next build
   ```
   For worker (Python) changes also: `python -m py_compile worker/<file>.py`.
5. **Commit** one logical unit with a descriptive message (`feat(scope): …` / `fix(scope): …`), ending with the Co-Authored-By trailer.

### 0.2 Code conventions (enforced)
- File-header TOC block + `#region`/`#endregion` folding for any file > 100 lines (see `CLAUDE.md`).
- Every DB read is **defensive**: wrap in `try/catch`, return empty/null if the table doesn't exist yet, so a missing migration degrades to an empty UI rather than a crash. Mirror the pattern in `src/lib/services/checkpoints.ts`.
- Pure logic is extracted from I/O so it's unit-testable without a DB (see `src/lib/services/counterfactuals.ts`, `attention.ts`).
- Errors returned to clients are generic (`{ error: "internal server error" }`); the real error is `console.error`-logged server-side (audit A-12).

### 0.3 Database & migration rule (critical)
- The live Neon journal is **drifted** (F-034 / LO-41). **Never run `drizzle-kit migrate` blind.**
- To add a table/column: (1) edit `src/lib/db/schema.ts`; (2) hand-author an **idempotent** migration `drizzle/NNNN_name.sql` using `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, separated by `--> statement-breakpoint`; (3) add the new table name to `scripts/verify-migration.mjs`'s `EXPECTED`; (4) the operator applies it with `node scripts/apply-migration.mjs drizzle/NNNN_name.sql` then `node scripts/verify-migration.mjs`.
- The PreToolUse guard (`scripts/claude-guard-edit.mjs`) blocks edits to **existing** migration files and to `.env*`. Author a new migration instead; never edit an applied one.

### 0.4 The agent-addition recipe (used by many tasks below)
To add an agent (`fn` = runs inline in a Vercel function; `worker` = runs on the Railway Python worker):
1. **Registry:** add an entry to `AGENTS` in `src/lib/agents/registry.ts` (`key`, `name`, `sidebarLabel`, `description`, `runtime`, `implemented`).
2. **Runner:**
   - `fn`: add a runner to `INLINE_RUNNERS` in `src/lib/agent-runners/index.ts`, implementation in `src/lib/agent-runners/<key>.ts` (pure core + thin I/O).
   - `worker`: add a `handle_<key>` to `worker/worker.py`'s `HANDLERS`, module under `worker/agents/<key>_agent/`.
3. **Inputs:** if the Run form needs fields, add them to `AGENT_INPUTS` in `src/lib/agents/run-inputs.ts`.
4. **Persistence:** if it writes typed rows, branch in `applyJobResult` (`src/lib/services/jobs.ts`).
5. **Critic target (optional):** add the key to `CRITIC_TARGET_AGENTS` in `src/lib/services/critic.ts`.
6. **Test:** pure unit test for the runner core; the agent appears in the dashboard automatically.

### 0.5 Effort / priority legend
`S` ≤ half-day · `M` 1–2 days · `L` 3–5 days · `XL` 1–2 weeks. Priority `P0` (do first / unblocks others) → `P3` (nice-to-have).

---

## 1. The Moat — the autonomous SEO Intelligence Engine (design Pillars 2–4)

> Today's `content-brief` is a **lexical shadow** of the real engine (term/heading overlap on public HTML). The differentiating product is a *measured information-gain* engine that reverse-engineers what already ranks and writes to beat the SERP median by a margin. This is the single highest-value area. Build it as a worker-side pipeline because it needs real fetching + heavier compute.

### IP-01 · Trend ingestion & scoring (`ingestAndScoreTrends`) — `L`, P1
**Why.** Perishable demand signals (rising queries) should drive *what* the pipeline works on, not a static seed list.
**Files.** `worker/agents/trends_agent/trends.py` (new), `worker/agents/trends_agent/scoring.py` (new, pure), `worker/worker.py` (handler `handle_trends`), `src/lib/agents/registry.ts` (agent `trends`), `src/lib/db/schema.ts` + `drizzle/0014_trend_signals.sql` (table `trend_signals`).
**Data model.** `trend_signals(id, site_id, term, source 'gtrends'|'reddit'|'keyword_planner', velocity real, acceleration real, score real, captured_at)`.
**Steps.**
1. Pure `scoring.py`: `score_trend(volume, velocity, acceleration, intent_weight) -> float` with the design §5 formula (`0.30*vol_norm + 0.25*velocity + 0.15*intent + …`). Unit-test the math with fixtures (rising vs flat vs decaying series → expected ordering).
2. `trends.py`: fetch Google Trends `interest_over_time` via the Playwright fallback (pytrends is archived); compute velocity = EMA slope, acceleration = Δslope. Degrade to Keyword-Planner MoM deltas on Trends loss (lower `base_confidence`), never emit garbage (design's "slow but never lie").
3. `handle_trends(payload)` → returns `{signals:[…]}`; `persistTrendSignals` in `applyJobResult`.
4. The Director reads top trend_signals during planning (extend the planner context in `src/lib/services/director.ts`).
**Acceptance.** Running the `trends` agent for a site writes `trend_signals` rows ordered by score; a rising series outranks a flat one (unit test); Trends outage falls back without throwing.
**Risk.** Bot-walling — honor robots + a 1-req/1.5–4s/IP token bucket; circuit-breaker on 429/403 (see IP-15).

### IP-02 · Live SERP scrape + parse (`scrapeAndParseSerp`) — `L`, P1
**Why.** The engine must see the *actual* top-10 for a query to reverse-engineer it. No real SERP analysis exists today.
**Files.** `worker/agents/serp_agent/serp.py` (new), `worker/agents/serp_agent/parse.py` (new, pure), `worker/worker.py` (`handle_serp`), schema `serp_snapshots(id, site_id, query, captured_at, results jsonb)` + `drizzle/0015_serp_snapshots.sql`.
**Steps.**
1. Pure `parse.py`: `parse_serp_html(html) -> [{rank, url, title, snippet}]`; unit-test against a saved fixture HTML.
2. `serp.py`: Playwright fetch with the anti-bot pool (rotating UA, residential proxy hook as config, stealth fingerprint), token-bucket throttle. Store the raw parsed results in `serp_snapshots`.
3. Respect `robots.txt`; route all outbound fetches through a Python `assert_public_url` mirror (reuse `worker/agents/tactics_scraper_agent/sources.py:assert_public_url`).
**Acceptance.** `serp` agent stores a parsed top-10 for a query; `parse_serp_html` passes on the fixture; blocked/loopback hosts refused.

### IP-03 · Semantic profile deconstruction — `L`, P2 (depends IP-02)
**Why.** Turn a winning competitor doc into its structure/entities so we can out-cover it.
**Files.** `worker/agents/semantic_agent/profile.py` (new, pure core + fetch), embeddings client (`worker/lib/embeddings.py` — use a free/local sentence-transformer to avoid API cost), schema `semantic_profiles(id, serp_snapshot_id, url, headings jsonb, entities jsonb, embedding vector|jsonb, word_count, captured_at)` + migration.
**Steps.**
1. Pure: `extract_structure(html) -> {headings:[…], word_count, entities:[…]}` (headings via tag parse; entities via a lightweight NER — spaCy small model or a regex+dictionary fallback). Unit-test on a fixture.
2. Embed each competitor doc (sentence-transformer, local — no Gemini quota). Store vectors as `jsonb` (Neon lacks pgvector by default; cosine in app code is fine at top-10 scale).
**Acceptance.** For a SERP snapshot, profiles exist for each result with headings + entities + an embedding; structure extraction unit-tested.

### IP-04 · Information-gain + coverage-gap computation — `M`, P1 (depends IP-03; this is the core)
**Why.** The actual "what to write" decision: the terms/entities/subtopics the top results share that *our* draft lacks, plus the gaps none of them cover (the gain).
**Files.** `src/lib/services/information-gain.ts` (new, **pure + heavily tested**) — keep this in TS so the brief agent and the Director can both call it; `src/lib/agent-runners/content-brief.ts` (upgrade to consume it).
**Steps.**
1. `computeCoverageGap(ourTerms: Set, competitorProfiles: Profile[]) -> { mustCover: string[], gain: string[], targetWordCount: number }`. `mustCover` = terms/entities in ≥ N of the top results we lack; `gain` = high-value subtopics under-covered by all (the differentiation). `targetWordCount` = median(top word counts) × margin.
2. Replace `content-brief`'s lexical scoring with this when SERP profiles are available; keep the lexical path as the credential-free fallback (defensive).
3. Record a `decision_records` row explaining the brief ("cover X because 7/10 top results do; add Y as the gain").
**Acceptance.** Given fixture profiles, `computeCoverageGap` returns the expected must-cover/gain split (unit tests for: all-cover-none, partial overlap, empty competitors); the brief agent uses it when profiles exist.

### IP-05 · Superior outline → draft synthesis with entity/meta/OG/alt injection — `M`, P2 (depends IP-04)
**Why.** The current `content-draft` is generic Gemini drafting; it should be *driven* by the coverage gap and inject the entities, meta title/description, OG tags, and image-alt scaffolding.
**Files.** `src/lib/agent-runners/content-draft.ts` (extend the prompt to take `mustCover`/`gain`/`targetWordCount`), add structured-output post-processing for meta/OG/JSON-LD.
**Acceptance.** A draft generated with a coverage gap contains every `mustCover` term and emits meta title/description + Article JSON-LD; a snapshot test asserts the structure.

### IP-06 · Closed-loop re-optimization — full loop (`checkRankAndMaybeReoptimize`) — `M`, P2 (depends §3 metrics_timeseries)
**Why.** LO-11 built the *trigger* (records recommendations). The full loop should *act*: on a confirmed SLIP/DECAY past the cooldown, auto-enqueue the cheapest-effective action (CTR-GAP → title/meta rewrite; SLIP → competitor re-scrape + section rewrite), gated by autonomy level.
**Files.** `src/lib/services/reoptimization.ts` (extend `runReoptimizationScan` to enqueue actions when `autonomyLevel >= L3`), add `agent_state.cooldown_until` per (site, page) (schema change) as anti-windup (21-day dead-time), and a 10% deterministic-hash **holdout cohort** so lift is measured vs a control.
**Steps.** 1. Add the cooldown column + a `withinCooldown(page, now)` pure check (tested). 2. The trigger taxonomy already exists (striking-distance/decayed); add SLIP/PLATEAU/CTR-GAP from `metrics_timeseries` deltas (median over a finalized window — a low-pass filter, never today-vs-yesterday). 3. Enqueue via `dispatchAgentJob` only when autonomy permits and cooldown elapsed.
**Acceptance.** A decayed page past cooldown enqueues exactly one reoptimize job at L3+; a page inside cooldown enqueues nothing; the holdout cohort is excluded from auto-action. Unit-test the trigger + cooldown logic.

---

## 2. Publishing & the content lifecycle

### IP-07 · Receipt-based idempotent publishing (`deployIdempotent`) — `L`, P1
**Why.** Publishing is `implemented: false`. A `publish` job may be delivered/replayed any number of times, yet for a fixed `(articleId, revision)` each CMS must converge to exactly one live object.
**Files.** `src/lib/services/publishing.ts` (new), schema `publish_receipts(id, article_id, revision, target_id, content_hash, remote_id, status, published_at)` + migration, agent `publishing` runner upgrade in `src/lib/agent-runners/` (it's currently a stub), `src/lib/publish-clients/` (one file per CMS).
**Steps.**
1. Pure `decidePublishAction(receipt | null, contentHash) -> "noop" | "create" | "update"` (matching hash → noop; higher revision → update on stored `remote_id`; none → create). Unit-test all three.
2. CMS clients: start with **Vercel/GitHub** (commit via the GitHub Contents API — the file `sha` is the optimistic-concurrency token; a stale `sha` → 409 → re-read + retry). Then WordPress (REST), Ghost (Admin API). Each behind the same `PublishClient` interface.
3. Multi-target publish is **not** rolled back on partial failure — each target is its own idempotent unit ("forward progress with disclosed gaps"); surface partial badges.
**Acceptance.** Re-running a publish with the same content returns `noop` (no duplicate); a content change issues an `update` to the same `remote_id`; a 2-of-3 publish reports 2 ok + 1 failed without rolling back. Unit-test the decision fn + a mocked GitHub client.

### IP-08 · CMS connection management UI — `M`, P2 (depends IP-07)
**Why.** Publish targets exist as raw JSON config rows with no per-kind form, validation, or "Test connection" (LO-45).
**Files.** `src/app/settings/` integration forms, `src/app/api/integrations/<kind>/test/route.ts` per CMS (mirror the existing `slack/test` route), a per-kind Zod schema in `src/lib/validation/`.
**Acceptance.** Each CMS kind has a typed form + a working "Test connection" that round-trips to the CMS and shows ✓/✗.

### IP-09 · `/articles` editing + revision history — `M`, P3
**Why.** Articles are viewable but not editable in-app, and revisions aren't tracked (needed by IP-07).
**Files.** `src/app/articles/[id]/edit/page.tsx`, an `article_revisions` table, a server action that bumps revision + persists. Reuse the `DiffView` (`src/lib/diff/line-diff.ts`) to show revision diffs.
**Acceptance.** Editing an article creates a new revision; the diff between revisions renders; publishing uses the latest revision number.

---

## 3. Data & analytics depth

### IP-10 · `metrics_timeseries` substrate — `M`, P0 (unblocks IP-06, IP-11, real trends)
**Why.** Per-page/per-query GSC + GA4 history is fetched on demand but never *stored* as a time series, so trend/decay math has no memory.
**Files.** schema `metrics_timeseries(id, site_id, entity_type 'page'|'query'|'site', entity_key, metric, value real, captured_on date)` + `drizzle/0016_metrics_timeseries.sql`, `src/lib/services/metrics-timeseries.ts` (upsert-by-(site,entity,metric,day)), wire into `cron/daily` after the GSC pull.
**Steps.** 1. `upsertMetric(...)` idempotent on the day key (a re-run same day overwrites, not duplicates). 2. In `cron/daily`, after `fetchGscTopPages`/`fetchGscTopQueries`, persist each row. 3. `seriesFor(siteId, entityKey, metric, days)` reader (defensive).
**Acceptance.** The daily cron writes one row per (page, metric, day); re-running the cron the same day doesn't duplicate; `seriesFor` returns a chronological series. Unit-test the upsert key + a reader over fixtures.

### IP-11 · Real GA4 conversions + revenue attribution — `M`, P2 (depends IP-10)
**Why.** The GA4 client exists but conversions/sessions aren't surfaced; "revenue impact" on `/analytics` is modeled, not measured.
**Files.** `src/lib/integrations/ga4.ts` (extend to pull `conversions`, `sessions`, `purchaseRevenue` by landing page), wire into `cron/daily` → `metrics_timeseries`, replace the modeled `revenueImpact` in `src/app/analytics/page.tsx` with measured values when GA4 is live.
**Acceptance.** With GA4 connected, `/analytics` shows measured conversions/revenue per page; degrades to "Modeled" otherwise.

### IP-12 · Rank-tracking data source — `M`, P2
**Why.** Performance Tracking was scoped as "GSC + GA4 + **rank**"; only GSC exists. GSC `position` is an average, not a tracked daily rank for target keywords.
**Files.** `worker/agents/rank_agent/` (Playwright SERP position lookup for the site's target keywords, reusing IP-02's SERP infra), persist to `metrics_timeseries` (`metric='rank'`). Tie each target keyword's rank to its `targets` row so the trajectory uses *measured* rank.
**Acceptance.** A target with metric `rank` accrues a daily measured position; the trajectory chart plots it.

---

## 4. Agent platform & job system

### IP-13 · Richer job state machine + `job_events` audit — `M`, P2
**Why.** `jobs.status` is 4 states (`queued|claimed|done|failed`); the design's finer taxonomy + an append-only audit would make failures forensically legible.
**Files.** `job_events(id, job_id, from_status, to_status, reason, at)` table + migration, emit an event on every transition in `src/lib/services/jobs.ts` (`claimNextJob`, `completeJob`, `failJob`), surface the timeline in the `RunCard`.
**Acceptance.** Every job transition writes an immutable event; the run console shows the full lifecycle. Defensive (no table → empty).

### IP-14 · Token + cost ledger per run — `S`, P2
**Why.** Cost is shown per-run from the result blob but not aggregated; there's no budget guardrail beyond the Critic's coarse check.
**Files.** `src/lib/services/cost-ledger.ts` (sum tokens/cost by agent/day from `runs.result`), a `/settings` card "spend this month", and a hard monthly cap in `kv_settings` that pauses generative agents when exceeded (extend `assertAgentNotPaused`).
**Acceptance.** The settings card shows month-to-date spend by agent; exceeding the cap blocks new generative dispatches with a clear message. Unit-test the aggregation + the cap check.

### IP-15 · Resilient scraping core (circuit breaker + token bucket) — `M`, P1 (shared by IP-01/02/12)
**Why.** All the new worker scrapers need one shared, polite, self-protecting fetch layer.
**Files.** `worker/lib/fetcher.py` (token-bucket per domain, circuit breaker CLOSED→OPEN on 429/403 spike serving last-good cache, `robots.txt` honor), refactor `tactics_agent._http_get` + the new scrapers to use it.
**Acceptance.** A burst of 429s opens the breaker (subsequent calls serve cache, don't hammer); the token bucket enforces ≤1 req/1.5s/domain. Unit-test the breaker + bucket with a fake clock injected (no real time/network).

### IP-16 · Dead-letter queue + manual replay — `S`, P3
**Why.** A job that exhausts `maxAttempts` is `failed` and forgotten.
**Files.** a `/runs` "failed jobs" filter + a "Retry" action (`POST /api/jobs/[id]/retry` that resets to `queued`), gated to admin.
**Acceptance.** A failed job can be re-queued from the UI; the retry is audited.

---

## 5. Director / LLM layer

### IP-17 · Streaming agent logs + token-streamed drafts (SSE) — `L`, P1
**Why.** Runs are point-in-time (poll/refresh); the most-requested trust/UX upgrade (LO-22/24) is a live log + token-streamed draft rendering.
**Files.** `src/app/api/agents/[key]/stream/route.ts` (SSE, `text/event-stream`, Fluid Compute supports long-lived Node functions), a `useEventSource` client hook, upgrade `LiveStatus` → a streaming `LogConsole` component. For drafts, stream Gemini tokens through the SSE channel.
**Acceptance.** Running an `fn` agent streams substep lines live; a draft renders token-by-token; closing the page cancels the stream (Fluid Compute request cancellation).
**Risk.** Verify SSE works through Vercel's Fluid Compute (read the runtime guide first); fall back to chunked polling if not.

### IP-18 · Director planning quality + tool-use hardening — `M`, P1
**Why.** Make the planner more reliable: structured tool-call schema validation, retry-on-malformed, and a tighter system prompt; audit the Telegram free-form path for injection (the `prompt-reviewer` subagent already exists — run it on every prompt change).
**Files.** `src/lib/services/director.ts` (validate the model's `actions` against a Zod schema; on mismatch, one corrective re-prompt before giving up), expand the adversarial-fixture tests in `src/lib/services/director*.test.ts`.
**Acceptance.** A malformed tool call triggers exactly one re-prompt then degrades gracefully; injection fixtures (instructions inside `<UNTRUSTED_TOOL_OUTPUT>`) never cause a dispatch. Tests prove both.

### IP-19 · Conversation memory + summarization — `M`, P3
**Why.** Long Director threads bloat the context window; `conversations` has no rolling summary compaction.
**Files.** `src/lib/services/conversations.ts` (`summarizeOlderMessages` — when a thread exceeds N messages, fold the oldest into a stored summary), use it in `getDirectorContext`.
**Acceptance.** A 100-message thread sends a bounded context (summary + recent N) to the planner; the summary is regenerated as the thread grows. Unit-test the windowing logic (pure).

---

## 6. UI/UX system completion (the "pretty face", design §2)

> The app is the warm-paper light theme only. The design specifies a 3-zone Mission Control. Build incrementally; each is independently shippable.

### IP-20 · Design tokens + dark mode + density toggle — `M`, P1 (foundation for the rest)
**Why.** No theming layer; colors are hardcoded hex throughout. A token layer unlocks dark mode, density, and consistency.
**Files.** `src/app/globals.css` (CSS custom properties for every color/space/radius — extend the motion tokens already there), a `ThemeProvider` + `next-themes`-style class toggle, a `data-density` attribute. **Mechanical migration:** replace hardcoded hex (`#141413`, `#d97757`, `#6b6a64`, `#e8e6dc`, `#faf9f5`, `#9a988e`) with `var(--…)` tokens across `src/app/**` and `src/components/**`.
**Steps.** 1. Define the token palette (light + dark values). 2. Add a toggle in the sidebar/settings persisted to `localStorage` + `kv_settings`. 3. Migrate components file-by-file; verify each still builds. Honor `prefers-reduced-motion` (already done) and `prefers-color-scheme` for the initial value.
**Acceptance.** Toggling dark mode restyles every page with no hardcoded-hex leakage (grep for `#` in className strings returns near-zero); density toggle changes padding; CLS stays 0.

### IP-21 · Mission Control shell (3-zone layout) — `L`, P2 (depends IP-20)
**Why.** The design's keystone: a left **PipelineLadder** (the 6-stage pipeline as a live vertical stepper), a center work canvas, a right **RAIL-R Approval Tray** (the single Attention Queue), with a persistent **StatusBar**.
**Files.** `src/app/(mission-control)/layout.tsx` (route group), `src/components/pipeline-ladder.tsx`, `src/components/approval-tray.tsx` (reuse the approvals client), `src/components/status-bar.tsx`. Drive everything from existing services (`pipeline state`, `checkpoints`, `attention`).
**Acceptance.** A single screen shows pipeline stage, the work canvas, and the attention queue; the StatusBar shows live agent/run/DB health. No new data layer — pure composition of existing services.

### IP-22 · Command palette (⌘K) — `S`, P2
**Why.** Power-user navigation + agent dispatch from anywhere.
**Files.** `src/components/command-palette.tsx` (a `cmdk`-style overlay), wired to routes + a "run agent" action.
**Acceptance.** ⌘K opens a fuzzy palette that navigates to any page and can dispatch a runnable agent.

### IP-23 · Mobile + responsive pass — `M`, P3
**Why.** The sidebar + grids assume desktop.
**Files.** responsive variants across `src/app/**`; a collapsible mobile sidebar; the approvals split-pane stacks on narrow viewports (already partly handled).
**Acceptance.** Every page is usable at 380px; no horizontal scroll; tap targets ≥ 44px.

### IP-24 · Empty / loading / error states audit — `S`, P2
**Why.** The defensive-engineering matrix (CLAUDE.md §6) requires explicit sized skeletons, clean empty states, and friendly "Try again" recovery on every async surface.
**Files.** add `loading.tsx` + `error.tsx` per route segment under `src/app/**`; sized skeletons matching final layout (CLS = 0).
**Acceptance.** Each route has a sized skeleton, an actionable empty state, and an error boundary with retry.

---

## 7. Security, privacy, compliance

### IP-25 · Pre-commit secret + migration guards in CI — `S`, P1
**Why.** `gitleaks` runs at CI only; `--no-verify` bypasses it (F-032). The repo has a secret-leak history.
**Files.** a Husky/`simple-git-hooks` pre-commit hook invoking `scripts/claude-guard-edit.mjs`-style checks + the existing `secret-leak-scanner` subagent's patterns; document in `CONTRIBUTING.md` (F-033).
**Acceptance.** A staged file containing a Telegram-token / Gemini-key shape is blocked pre-commit; the CI gitleaks job still runs as backstop.

### IP-26 · Full nonce-based CSP (drop `unsafe-inline`) — `M`, P2
**Why.** CSP dropped `unsafe-eval` but still allows `unsafe-inline` for scripts (A-06 partially closed). Next 16 supports per-request nonces.
**Files.** `src/middleware.ts` (generate a per-request nonce, set it on the CSP header + pass to Next's script tags), `next.config.ts` (remove the static `unsafe-inline`).
**Acceptance.** Deployed app loads with a nonce CSP and **no** `unsafe-inline` in `script-src`; DevTools shows zero CSP violations under normal navigation (the deferred A-06 smoke test).
**Risk.** Hydration breaks if a nonce is missed — test the deployed build, not just local.

### IP-27 · DNS-pinned SSRF fetch (close the TOCTOU) — `M`, P3
**Why.** `safeFetch` validates resolved IPs but `fetch()` re-resolves (a documented rebind TOCTOU).
**Files.** `src/lib/agents/safe-fetch.ts` — resolve once, then connect to the **validated IP** with `Host` header preserved (custom `undici` dispatcher / `lookup` override). Same pin in `worker/lib/fetcher.py`.
**Acceptance.** A host that rebinds between resolve and connect cannot reach an internal IP (integration test with a controlled resolver).

### IP-28 · Multi-user, roles, and per-user audit — `XL`, P3
**Why.** Single shared admin today. Teams need accounts, roles (owner/editor/viewer), and per-user attribution on approvals/decisions.
**Files.** `users` + `memberships` tables, NextAuth multi-provider, row-level scoping by `site_id` membership, replace the single `auth_config` with a users table (migration with a data backfill of the current admin).
**Acceptance.** Two users with different roles see scoped data; a viewer cannot approve; every decision records the acting user.

---

## 8. Performance & scalability

### IP-29 · Query + N+1 audit — `S`, P2
**Why.** Several pages fan out per-row queries (e.g., site lookups, critique lookups). Most are batched (`inArray`) but a pass would catch the rest.
**Files.** audit `src/app/**/page.tsx` for per-iteration `await db…`; batch with `inArray`/joins; add DB indexes for hot filters (most exist — verify `runs(subject_key)`, `metrics_timeseries(site_id, entity_key, captured_on)`).
**Acceptance.** No page issues > O(1) queries per entity type; index coverage for every `WHERE`/`ORDER BY` on hot paths.

### IP-30 · Caching + ISR for read-heavy pages — `M`, P3
**Why.** Dashboard/analytics recompute on every load; many are `force-dynamic` unnecessarily.
**Files.** apply the runtime cache / ISR (`revalidate`) to pages whose data changes at most daily (analytics, decisions, tactics); keep approvals/runs dynamic. Use Vercel's runtime cache for the GSC pulls.
**Acceptance.** Analytics serves from cache between daily pulls; Lighthouse TTFB improves; data correctness preserved (revalidate on the daily cron).

### IP-31 · Bundle + Core Web Vitals — `S`, P3
**Files.** `@next/bundle-analyzer` pass; code-split heavy client components (charts, the approvals client); ensure fonts are `next/font` with `display: swap`; sized images.
**Acceptance.** Lighthouse ≥ 90 across the board; CLS = 0; no client bundle > the budget you set.

---

## 9. Testing & quality

### IP-32 · Playwright E2E for the critical paths — `M`, P1
**Why.** No E2E exists (LO-51). The login → dashboard → run-agent → approve → sign-out flow is untested end-to-end.
**Files.** `e2e/` Playwright suite; seed via `scripts/seed-admin.mjs`; run against a preview deployment or local `next start` with a test DB.
**Acceptance.** CI runs the E2E suite on every PR; the core flow is green.

### IP-33 · Hermetic test DB — `M`, P2
**Why.** Live-DB service tests hit shared production Neon (slow/flaky, LO-52). Use a disposable Postgres (Docker / Neon branch) per test run.
**Files.** a `vitest.setup.ts` that spins a throwaway DB + runs all migrations (via `apply-migration`) before the live-DB suites; a `DATABASE_URL_TEST` env.
**Acceptance.** `npm test` runs fully offline against an ephemeral DB; no shared-prod dependency; deterministic.

### IP-34 · Full CI gate (tsc + lint + vitest + build) — `S`, P0
**Why.** Only `gitleaks` runs in CI; tests/tsc/lint/build run only locally (LO-53) — a green build depends on operator discipline.
**Files.** `.github/workflows/ci.yml` — matrix job: `npm ci`, `tsc --noEmit`, `eslint`, `vitest run` (with the hermetic DB from IP-33), `next build`, `python -m py_compile worker/**`.
**Acceptance.** Every PR is gated; a red check blocks merge.

---

## 10. Developer experience & operations

### IP-35 · Error tracking + structured logging — `S`, P1
**Files.** Sentry (or Vercel's observability) wired into both Next and the worker; replace bare `console.error` with a structured logger that carries `siteId`/`jobId`/`runId` (extend `src/lib/observability/logger.ts`).
**Acceptance.** A thrown error surfaces in the dashboard with the request context; worker exceptions are captured with the job id.

### IP-36 · Feature flags — `S`, P2
**Why.** Ship the big engine behind a flag; ramp safely.
**Files.** `src/lib/services/flags.ts` (read from `kv_settings`), gate IP-01…IP-06 behind `flag.intelligence_engine`.
**Acceptance.** A flag flip enables/disables the engine without a redeploy; default off.

### IP-37 · Health, alerting, and runbook automation — `S`, P2
**Files.** extend `/api/health` to assert worker freshness (last-claimed-job age) + DB + secret presence; a cron that alerts Slack/Telegram when the worker is stale or a cron hasn't run; fold the operator steps (the merge/migrate/secrets checklist) into `OPERATIONS.md`.
**Acceptance.** A dead worker triggers an alert within one cron cycle; `/api/health` returns a red/green per subsystem.

---

## 11. New product surfaces (functionality ideas)

These are net-new capabilities, roughly ordered by leverage. Each follows §0.4 (agent recipe) or the page/service patterns above.

- **IP-38 · Content calendar / scheduling** (`M`, P2): schedule cycles + publishes on a calendar; a `scheduled_publishes` table + a cron that fires due items. Page `/calendar`.
- **IP-39 · Competitor monitoring (continuous)** (`M`, P2): periodic re-crawl + SERP-position tracking for tracked competitors; diff alerts when a competitor publishes/changes. Extends the existing Competitors workspace.
- **IP-40 · A/B testing of titles/meta** (`L`, P3): two variants per page, measured CTR from GSC over a finalized window, auto-promote the winner. Needs IP-10 + IP-07.
- **IP-41 · Internal-linking optimizer** (`M`, P2): use the Site Crawl link graph to recommend internal links that pass authority to target pages; one-click apply via the edit path (IP-09).
- **IP-42 · Keyword cannibalization detector** (`S`, P2): flag multiple pages competing for the same query from GSC per-page/per-query data (IP-10). Pure analysis + a `/decisions` recommendation.
- **IP-43 · Bulk operations** (`S`, P3): multi-select on keywords/ideas/articles for batch approve/shelve/dispatch.
- **IP-44 · Reporting / exports v2** (`S`, P3): scheduled PDF/email reports (weekly digest as a real document); reuse the export domain layer.
- **IP-45 · Public REST API + webhooks** (`M`, P3): a tokened API for external automation + outbound webhooks on key events (publish, rank change). Reuses the service layer.
- **IP-46 · AI Gateway migration** (`S`, P2): route Gemini calls through Vercel AI Gateway for observability, fallbacks, and zero-retention; centralize model selection (already in `model-router.ts`).
- **IP-47 · Onboarding wizard** (`S`, P2): first-run flow that creates the site, connects GSC, sets the first target, and runs the first audit — reduces time-to-value.

---

## 12. Prioritized roadmap (suggested sequencing)

> Build in phases; each phase ends with everything green (tsc + lint + tests + build) and a deploy. Dependencies are noted so a smaller model never starts a blocked task.

| Phase | Theme | Tasks (in order) | Why now |
|---|---|---|---|
| **P0 — Foundations** | Make the platform trustworthy to iterate on | IP-34 (CI gate) → IP-33 (hermetic DB) → IP-10 (metrics_timeseries) → IP-25 (pre-commit guards) → IP-35 (error tracking) | Everything downstream is safer with CI, an ephemeral test DB, a metrics substrate, and observability. |
| **P1 — The Moat, part 1** | Start the real engine behind a flag | IP-36 (flags) → IP-15 (resilient fetch core) → IP-01 (trends) → IP-02 (SERP scrape) → IP-04 (information-gain, with the lexical fallback) | The differentiating value. Flag-gated so it ships incrementally. |
| **P2 — Trust & live data** | Make the loop real and legible | IP-17 (SSE streaming) → IP-11 (GA4 conversions) → IP-12 (rank tracking) → IP-06 (full reopt loop) → IP-18 (planner hardening) | Closes the measure→act loop on real data; streaming is the top UX ask. |
| **P3 — Publishing** | Ship the generative half | IP-03 → IP-05 (synthesis) → IP-07 (idempotent publish) → IP-08 (CMS UI) → IP-09 (article editing) | Completes the pipeline end-to-end. |
| **P4 — UI system** | The pretty face at scale | IP-20 (tokens + dark mode) → IP-24 (states) → IP-21 (Mission Control) → IP-22 (⌘K) → IP-23 (mobile) | Now that the logic exists, give it the designed shell. |
| **P5 — Hardening & scale** | Production-grade | IP-26 (nonce CSP) → IP-13 (job_events) → IP-14 (cost ledger) → IP-29/30/31 (perf) → IP-32 (E2E) → IP-37 (alerting) | Defense-in-depth + performance + coverage. |
| **P6 — Growth surfaces** | New product value | IP-46 (AI Gateway) → IP-41 (internal linking) → IP-42 (cannibalization) → IP-38 (calendar) → IP-39 (competitor monitoring) → IP-47 (onboarding) → IP-28 (multi-user) → the rest | Once the core is solid, expand outward. |

### The single most important next step
**IP-10 (metrics_timeseries) + IP-04 (information-gain).** They unblock the most value: a real measurement substrate and the actual "what to write to win" decision. Start there after the P0 foundations.

---

*This plan is a living document. As tasks land, move them into `docs/platform-design.md` §0.2 (built) and strike them here. Keep `.claude/active_context.md` pointed at the current phase.*
