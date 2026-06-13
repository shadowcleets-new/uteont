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

---

# PART B — Additional dimensions (breadth)

> The sections above (IP-01…IP-47) cover the product/engine spine. The sections
> below cover the cross-cutting concerns a production SaaS needs but that are
> easy to forget. Same recipe per task: *why · files · steps · acceptance.*

## 13. Accessibility (WCAG 2.2 AA) — P1 for a public product

The app must be operable by keyboard and assistive tech. `prefers-reduced-motion` is already honored; the rest is a deliberate pass.

- **IP-48 · Semantic landmarks + heading order** (`S`): every page wraps content in `<main>`, the sidebar in `<nav aria-label>`, and uses exactly one `<h1>` with a non-skipping heading hierarchy. **Files:** `src/app/**/page.tsx`, `src/components/sidebar.tsx`. **Acceptance:** axe-core (via the `chrome-devtools-mcp:a11y-debugging` skill or `@axe-core/playwright`) reports zero landmark/heading violations.
- **IP-49 · Focus management + visible focus rings** (`S`): every interactive element is reachable by Tab in DOM order; `:focus-visible` rings on all buttons/links/inputs (some exist); a "skip to content" link; focus is trapped in modals/the command palette and restored on close. **Acceptance:** the full login→approve flow is completable with keyboard only; focus never lost to `<body>`.
- **IP-50 · ARIA for dynamic content** (`M`): the streaming `LogConsole` (IP-17) uses `aria-live="polite"`; toasts (the undo toast) use `role="status"`; the attention banner announces changes; charts have `role="img"` + a text `aria-label` summary (the trajectory chart already does). **Acceptance:** a screen reader announces a completed run and the undo toast.
- **IP-51 · Color contrast + non-color signals** (`S`): every text/background pair meets 4.5:1 (3:1 for large); status is never color-only (pair every badge with an icon/label — mostly done). Audit the warm-paper palette + the dark palette (IP-20). **Acceptance:** contrast checker passes on both themes; grayscale screenshot still legible.
- **IP-52 · Forms a11y** (`S`): every input has an associated `<label htmlFor>`; errors use `aria-describedby` + `aria-invalid`; required fields marked. **Acceptance:** axe forms ruleset clean across settings/targets/campaigns forms.

## 14. Internationalization & multi-locale SEO — P2

`sites.locale` exists but the app UI and the content engine are English-only.

- **IP-53 · App i18n scaffolding** (`M`): adopt `next-intl`; extract UI strings to message catalogs; locale from user pref in `kv_settings`. **Files:** `src/i18n/`, `messages/<locale>.json`, wrap `src/app/layout.tsx`. **Acceptance:** switching locale re-renders the shell in that language; default English unchanged.
- **IP-54 · Multi-locale content generation** (`M`): the engine respects `sites.locale` — Research/SERP/Content agents target the right Google domain + language; hreflang scaffolding in generated meta. **Files:** thread `locale` through `dispatchAgentJob` payload → worker agents; `content-draft` emits `hreflang` hints. **Acceptance:** a non-en site generates locale-appropriate keywords + drafts; hreflang present.
- **IP-55 · RTL support** (`S`): `dir="rtl"` driven by locale; logical CSS properties (`margin-inline`) instead of left/right. **Acceptance:** an RTL locale mirrors the layout without breakage.

## 15. Email & notification infrastructure — P1

Notifications today are Telegram + Slack + an in-app `notifications` table. Email (the universal channel) is missing.

- **IP-56 · Transactional email** (`M`): integrate Resend (or Vercel's email partner); a `sendEmail(to, template, data)` service with React Email templates. Use for: password setup, weekly digest, approval-needed, critical alerts. **Files:** `src/lib/services/email.ts`, `emails/` templates, env `RESEND_API_KEY`. **Acceptance:** a digest email renders + sends; failures are logged, never block the cron.
- **IP-57 · In-app notification center** (`S`): a bell icon + dropdown reading the `notifications` table with read/unread state and a mark-all-read action. **Files:** `src/components/notification-center.tsx`, `notifications.read_at` column + migration. **Acceptance:** new events appear in the bell; unread count badges; marking read persists.
- **IP-58 · Per-channel notification preferences** (`S`): a settings matrix (event × channel: email/telegram/slack/in-app) persisted to `kv_settings`; the dispatch layer reads it. **Acceptance:** muting "completion" on email but keeping "error" on telegram is honored.
- **IP-59 · Notification severity routing** (`S`, extends LO-21/IP-50): the `attention.ts` severity model decides the channel — critical → push (telegram/email), info → batched digest only. **Acceptance:** a critical checkpoint pages immediately; routine successes only show in the weekly digest.

## 16. Billing, plans & usage metering (SaaS readiness) — P3, but design-now

If this becomes a product, monetization needs the data model early so usage is metered from day one.

- **IP-60 · Usage metering** (`M`): a `usage_events(id, account_id, kind 'agent_run'|'article'|'gsc_pull', quantity, at)` table; emit on every billable action (reuse the cost ledger IP-14). **Acceptance:** usage is queryable per account per month; no double-count (idempotent on job id).
- **IP-61 · Plans + entitlements** (`M`): a `plans` definition (free/pro/agency) with limits (sites, monthly agent runs, seats); an `assertWithinPlan(account, action)` gate before dispatch. **Acceptance:** a free account hitting its run cap is blocked with an upgrade prompt; pro is not.
- **IP-62 · Stripe integration** (`L`, depends IP-28 multi-user): checkout, webhooks (`customer.subscription.updated`), the customer portal; `account.plan` synced from Stripe. **Acceptance:** subscribing upgrades entitlements within one webhook; cancellation downgrades at period end.

## 17. Privacy, GDPR/CCPA & data retention — P2

The app scrapes the open web and stores LLM I/O; it needs a defensible data-handling posture.

- **IP-63 · Data retention policies** (`S`): TTL on high-volume tables — `runs.result_json` (>90d → prune the blob, keep telemetry), `login_attempts` (>30d), `serp_snapshots`/`metrics_timeseries` (configurable). A weekly cron enforces it (the cron route exists; wire the purge). **Acceptance:** old blobs are pruned; the purge is idempotent + logged.
- **IP-64 · Data export + deletion (DSAR)** (`M`, depends IP-28): an account can export all its data (JSON/ZIP) and request full deletion (cascade by `account_id`). **Acceptance:** export contains every row tied to the account; deletion leaves no orphan.
- **IP-65 · PII scrubbing in logs + LLM context** (`S`): a `redactPII(text)` pass before logging or feeding scraped content to the planner (emails, phone numbers). Extends the `<UNTRUSTED_TOOL_OUTPUT>` fence. **Acceptance:** a fixture with an email/phone is redacted in logs + planner input. Pure + tested.
- **IP-66 · Cookie consent + privacy policy** (`S`): a consent banner if any third-party analytics is added (IP-67); a `/privacy` + `/terms` page. **Acceptance:** no non-essential cookies before consent.

## 18. Backup, DR & data lifecycle — P1 (ops-critical)

`OPERATIONS.md` notes a quarterly Neon restore drill is owed (F-026).

- **IP-67 · Automated backup verification** (`S`): a monthly cron that creates a Neon branch from a backup, runs `verify-migration.mjs` against it, and alerts on failure. **Acceptance:** the drill runs unattended monthly; a corrupt backup pages the operator.
- **IP-68 · Point-in-time recovery runbook** (`S`): a tested, step-by-step restore procedure in `OPERATIONS.md` (stop writes → restore branch → verify → swap `DATABASE_URL` → restart worker). **Acceptance:** the runbook has been executed once successfully (the drill).
- **IP-69 · Schema-evolution discipline** (`S`): document the additive-only migration rule (no destructive DDL without a two-phase expand/contract); a CI check that new migrations contain no `DROP`/`ALTER … TYPE` without a `-- @destructive-ack` comment. **Acceptance:** a destructive migration without the ack fails CI.

## 19. Product analytics (dogfood the app's own usage) — P2

The app optimizes SEO funnels but doesn't measure its own.

- **IP-70 · Event tracking** (`S`): a typed `track(event, props)` (the existing `product-tracking-skills` plugin can scaffold the plan); send to a privacy-respecting sink (PostHog/Amplitude or a self-hosted `app_events` table). Cover: agent dispatched, checkpoint decided, GSC connected, time-to-first-value. **Acceptance:** a funnel "site created → GSC connected → first publish" is queryable.
- **IP-71 · Activation & retention dashboards** (`S`): an internal `/admin/metrics` page (or the analytics sink) showing DAU/WAU, activation rate, feature adoption. **Acceptance:** the team can see which features are used.

## 20. In-app help, docs & onboarding — P2

- **IP-72 · Contextual help** (`S`): the `InfoTooltip` pattern already exists — extend it to every non-obvious control; a `?` help drawer per page. **Acceptance:** every settings/target field has a one-line explainer.
- **IP-73 · Product tour** (`S`, depends IP-47 onboarding): a dismissible first-run tour highlighting the pipeline, approvals, and the Director. **Acceptance:** a new account sees the tour once; it's resumable + skippable.
- **IP-74 · Living docs site** (`M`): a `/docs` section (MDX) covering each agent, the approval model, and the autonomy levels; generated from the registry where possible. **Acceptance:** every agent has a doc page; the autonomy levels are explained.

## 21. Media & OG-image pipeline — P3

Generated content needs hero + social images.

- **IP-75 · Dynamic OG images** (`S`): `next/og` `ImageResponse` routes generating per-article OG cards (title + site brand). **Files:** `src/app/api/og/route.tsx`. **Acceptance:** sharing an article URL renders a branded OG card.
- **IP-76 · Hero/inline image generation** (`M`): an `images` agent that generates or sources (licensed/stock API) hero images for drafts, with alt text from the content. Route through the AI Gateway (image models) or a stock API. **Acceptance:** a draft gets a hero image + descriptive alt; license metadata stored.

## 22. Search & navigation within the app — P3

- **IP-77 · Global content search** (`M`): full-text search across keywords/ideas/articles/tactics/decisions (Postgres `tsvector` + GIN index, or the `metrics`/content tables). Surface in the ⌘K palette (IP-22). **Acceptance:** searching a phrase finds it across content types ranked by relevance.

## 23. Real-time collaboration — P3 (depends IP-28)

- **IP-78 · Comments + mentions on checkpoints/articles** (`M`): a `comments(id, target_type, target_id, author_id, body, at)` table; @-mentions notify (IP-56/57). **Acceptance:** two users can discuss a draft inline; a mention notifies.
- **IP-79 · Presence + live updates** (`M`): SSE/WebSocket (Vercel supports via Fluid Compute) broadcasting checkpoint/queue changes so the approvals inbox updates without refresh. **Acceptance:** an approval by one user disappears from another's queue live.

## 24. Observability — tracing, metrics, RUM — P1

`src/lib/observability/logger.ts` exists; deepen it.

- **IP-80 · Distributed tracing** (`M`): OpenTelemetry spans across the request → dispatch → worker → completion path, correlated by `jobId`. Export to the platform's tracing (Vercel/OTel collector). **Acceptance:** a slow run is traceable end-to-end with per-span timing.
- **IP-81 · App + worker metrics** (`S`): counters/histograms (jobs by status, agent latency p50/p95, Gemini tokens/day, queue depth) on a `/metrics` endpoint or pushed. **Acceptance:** a dashboard shows queue depth + agent latency over time.
- **IP-82 · Real-user monitoring (RUM) + Web Vitals** (`S`): `useReportWebVitals` → the analytics sink; alert on CWV regressions. **Acceptance:** LCP/CLS/INP tracked per route; a regression alerts.

## 25. Database scaling & data architecture — P2 (as volume grows)

- **IP-83 · Connection pooling discipline** (`S`): confirm every serverless path uses the pooled Neon URL (`DATABASE_URL`, not `_UNPOOLED`) except migrations; a lint/check. **Acceptance:** no function uses an unpooled connection at runtime.
- **IP-84 · Time-series partitioning + archival** (`M`, depends IP-10): partition `metrics_timeseries`/`serp_snapshots` by month; archive >12-month partitions to cold storage. **Acceptance:** queries stay fast as the series grows; old data is archived, not deleted.
- **IP-85 · Read-path optimization** (`S`): materialized rollups (daily agent stats, monthly spend) refreshed by cron instead of computed per page-load. **Acceptance:** the dashboard reads a rollup, not a full scan.
- **IP-86 · Redis/queue upgrade path** (`L`, only at scale): the Postgres queue is the bottleneck-free choice until ~10⁴ jobs/day; document the BullMQ/Redis swap behind the `enqueueJob` interface so it's a drop-in. **Acceptance:** the queue interface is abstracted; the swap touches one module.

## 26. API platform — rate limiting, versioning, SDKs — P3 (depends IP-45)

- **IP-87 · Rate limiting + abuse prevention** (`M`): per-token + per-IP limits (Vercel BotID + a token-bucket in `kv_settings`/edge KV) on all public + auth routes; extends the login limiter. **Acceptance:** a burst is throttled with `429 Retry-After`; legit traffic unaffected.
- **IP-88 · Versioned public API + OpenAPI** (`M`): `/api/v1/*` with a generated OpenAPI spec; a typed client. **Acceptance:** the spec validates; a client can list sites/dispatch an agent/read runs.
- **IP-89 · Outbound webhooks** (`S`): subscribe to events (publish, rank-change, checkpoint); signed deliveries with retry. **Acceptance:** a subscriber receives a signed, retried `article.published` event.

## 27. Content safety & moderation — P2

Generated + published content is a brand/legal risk.

- **IP-90 · Output safety checks** (`S`): extend the QA agent — a `safety.ts` lint for prohibited claims, plagiarism signals (n-gram overlap vs scraped sources), and the existing banned-phrases list; block publish on a hard fail. **Acceptance:** a draft echoing a source verbatim is flagged; banned phrases block publish. Pure + tested.
- **IP-91 · Disclosure + compliance tags** (`S`): auto-insert affiliate/AI-content disclosures per site policy; a `content_policy` config. **Acceptance:** a site requiring disclosure gets it injected into every publish.

## 28. White-label / agency mode — P3 (depends IP-28)

- **IP-92 · Per-account branding** (`M`): logo, colors (drive the IP-20 tokens from account config), custom domain per workspace (Vercel for Platforms). **Acceptance:** an agency account renders its brand; client sites are isolated.

## 29. Compliance & audit readiness (SOC2-lite) — P3

- **IP-93 · Immutable audit log** (`S`): a tamper-evident `audit_log` (hash-chained rows) for every security-relevant action (auth change, secret access, destructive op). Extends `approvals`/`decision_records`. **Acceptance:** the chain verifies; a tampered row is detectable.
- **IP-94 · Access reviews + least privilege** (`S`, depends IP-28): a quarterly access-review export; service tokens scoped to the minimum. **Acceptance:** the review lists every principal + its grants.

## 30. Load testing & capacity planning — P2

- **IP-95 · Load test harness** (`M`): k6/Artillery scenarios for the queue (N concurrent worker claims), the dashboard, and the Director; run in CI nightly against preview. **Acceptance:** the system sustains a target RPS/queue depth with bounded p95; regressions alert.
- **IP-96 · Capacity model** (`S`): document the limits (Gemini 1500 req/day, Neon connection cap, worker throughput) and the headroom per plan tier (IP-61). **Acceptance:** the model predicts when each ceiling is hit per usage tier.

---

# PART C — Reference material & templates

## C.1 — The task template (copy this for any new task)

```markdown
### IP-NN · <imperative title> — <effort S/M/L/XL>, <priority P0–P3>
**Why.** <the problem in 1–2 sentences + the value of fixing it>
**Depends on.** <IP-xx, or "none">
**Files.**
  - create: <path> — <one-line purpose>
  - modify: <path> — <what changes>
  - schema: <table> + drizzle/NNNN_name.sql   (if any)
**Data model.** <table(s) with columns + types>  (if any)
**Steps (TDD).**
  1. Write failing test <path>.test.ts: <the behavior + the key cases>.
  2. Run it, watch it fail for the right reason.
  3. Implement the minimal pure core <path>.ts.
  4. Wire into <service/route/page>.
  5. Verify: vitest <test> → tsc → eslint → next build (→ py_compile if worker).
**Acceptance (Definition of Done — all must hold).**
  - [ ] <observable behavior 1>
  - [ ] <observable behavior 2>
  - [ ] tests green, tsc clean, eslint clean, build green
  - [ ] defensive: missing table/secret → degrades, never crashes
**Risk / rollback.** <what could break + how to revert (it's behind a flag / additive migration)>
```

## C.2 — Definition of Done (applies to EVERY code task)

A task is done only when **all** are true:
1. A test was written **first**, watched fail, then passed (no production code without a prior failing test).
2. `npx vitest run <new tests>` — green.
3. `npx tsc --noEmit` — zero errors.
4. `npx eslint <changed files>` — zero errors.
5. `next build` — compiles, all routes render.
6. Worker changes: `python -m py_compile` clean.
7. Any DB read is defensive (missing table → empty, no throw).
8. New table → idempotent migration authored + added to `verify-migration.mjs` `EXPECTED` (NOT applied blind).
9. New external call → SSRF-guarded (`safeFetch`/`assert_public_url`) and timeout-bounded.
10. New user-facing surface → has loading + empty + error states and is keyboard-accessible.
11. One focused commit with a `type(scope): summary` message + the Co-Authored-By trailer.
12. If it touches an LLM prompt or a structured-output schema → run the `prompt-reviewer` subagent.

## C.3 — Fully-worked reference task (copy this exact pattern)

> This is IP-42 (keyword-cannibalization detector) built end-to-end so a small
> model has a concrete, correct template covering pure-core + test + service +
> page + sidebar. It depends on IP-10's `metrics_timeseries` for its data, but
> the **pure core is fully testable today** with injected data.

**Step 1 — the failing test** `src/lib/services/cannibalization.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { detectCannibalization } from "./cannibalization";

const row = (query: string, page: string, impressions: number, position: number) =>
  ({ query, page, impressions, position });

describe("detectCannibalization (IP-42)", () => {
  it("flags a query where 2+ pages both rank with real impressions", () => {
    const out = detectCannibalization([
      row("seo tools", "/a", 800, 6),
      row("seo tools", "/b", 500, 9),
      row("link building", "/c", 900, 4),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].query).toBe("seo tools");
    expect(out[0].pages.map((p) => p.page).sort()).toEqual(["/a", "/b"]);
  });

  it("ignores a query served by a single page", () => {
    expect(detectCannibalization([row("solo", "/x", 1000, 3)])).toHaveLength(0);
  });

  it("ignores pages below the impressions floor (noise)", () => {
    const out = detectCannibalization([row("q", "/a", 5, 7), row("q", "/b", 4, 8)]);
    expect(out).toHaveLength(0);
  });

  it("sorts competing pages best-rank-first", () => {
    const out = detectCannibalization([row("q", "/a", 200, 9), row("q", "/b", 200, 3)]);
    expect(out[0].pages[0].page).toBe("/b");
  });
});
```

**Step 2 — run it, watch it fail** (`Cannot find module './cannibalization'`).

**Step 3 — the pure core** `src/lib/services/cannibalization.ts`:
```ts
/**
 * @file cannibalization.ts
 * @description IP-42 — detect keyword cannibalization: a single query where two
 * or more of OUR pages both rank with meaningful impressions, splitting
 * authority. Pure + tested; the caller supplies GSC per-(page,query) rows
 * (from metrics_timeseries / the GSC by-page-by-query pull).
 */

export interface PageQueryRow {
  query: string;
  page: string;
  impressions: number;
  position: number;
}

export interface Cannibalization {
  query: string;
  pages: Array<{ page: string; impressions: number; position: number }>;
  totalImpressions: number;
}

const MIN_IMPRESSIONS = 10; // per page, below this it's noise

export function detectCannibalization(rows: PageQueryRow[]): Cannibalization[] {
  const byQuery = new Map<string, PageQueryRow[]>();
  for (const r of rows) {
    if (r.impressions < MIN_IMPRESSIONS) continue;
    const list = byQuery.get(r.query) ?? [];
    list.push(r);
    byQuery.set(r.query, list);
  }
  const out: Cannibalization[] = [];
  for (const [query, pages] of byQuery) {
    if (pages.length < 2) continue; // only one page ranks → not cannibalization
    const sorted = [...pages].sort((a, b) => a.position - b.position); // best rank first
    out.push({
      query,
      pages: sorted.map((p) => ({ page: p.page, impressions: p.impressions, position: p.position })),
      totalImpressions: sorted.reduce((s, p) => s + p.impressions, 0),
    });
  }
  return out.sort((a, b) => b.totalImpressions - a.totalImpressions);
}
```

**Step 4 — wire it (record recommendations + a page).** Add a scan that runs in `cron/daily` after the GSC pull (mirror `runReoptimizationScan`): for each cannibalization, `recordDecision({ subjectKey: "loop.cannibalization", kind: "warning", title, rationale, … })`. Add a read-only `/cannibalization` page that lists current findings (defensive read), and a sidebar link under DATA. Both follow the `/cycles` page pattern exactly.

**Step 5 — verify:** `npx vitest run src/lib/services/cannibalization.test.ts && npx tsc --noEmit && npx eslint src/lib/services/cannibalization.ts && next build`.

**Definition of Done:** the 4 tests pass; the cron records one warning per cannibalized query; the page renders findings or a clean empty state; everything green.

## C.4 — Algorithm specs (the math, unambiguous)

**Information-gain coverage gap (IP-04).** Given our draft term set `O` and the top-N competitor profiles each with a term/entity set `C_i`:
```
df(t)        = |{ i : t ∈ C_i }|                         # document frequency across top-N
mustCover    = { t : df(t) ≥ ceil(0.6 · N)  AND  t ∉ O } # ≥60% of winners cover it, we don't
underCovered = { t : 1 ≤ df(t) ≤ floor(0.3 · N) }        # niche; a differentiation opportunity
gain         = top-K underCovered by (idf(t) · intentWeight(t))   # the moat: cover what others thin-cover
targetWords  = median(wordCount_i) · 1.15                 # beat the median by a 15% margin
```
`idf(t) = log(N / (df(t)+1))`. Tune `0.6`, `0.3`, `K`, `1.15` via `kv_settings` so they're operator-adjustable. Unit-test each set with hand-built fixtures.

**Trend score (IP-01).** `score = 0.30·norm(volume) + 0.25·clamp(velocity,0,1) + 0.20·clamp(accel,0,1) + 0.15·intentWeight + 0.10·norm(serpGap)`, where `velocity = EMA_slope(interest, α=2/(7+1))`, `accel = Δvelocity`. `intentWeight`: transactional 1.0 / commercial 0.8 / informational 0.4 / navigational 0.1.

**Re-optimization triggers (IP-06), median over a finalized window (low-pass filter):**
```
SLIP     : rank_delta_7d = median(pos[d-13..d-7]) − median(pos[d-6..d-0]) ≥ +3
PLATEAU  : |rank_delta_28d| < 1  AND on page 2 (11–20)  for ≥ 60 days
CTR_GAP  : ctr < 0.5 · expected_ctr(position)
DECAY    : impressions_28d down ≥ 30% at flat rank (|Δrank| < 1)
```
Never compare today-vs-yesterday (that feeds SERP jitter into the actuator). Respect `cooldown_until` (21d dead-time = anti-windup). Exclude the 10% deterministic-hash holdout cohort from auto-action.

## C.5 — Design token palette (IP-20)

Define in `:root` (light) and `.dark`/`[data-theme=dark]`. Replace these hardcoded hex across the codebase with the matching `var(--…)`:

| Token | Light | Dark | Replaces (current hardcoded) |
|---|---|---|---|
| `--bg` | `#faf9f5` | `#1a1915` | page background `#faf9f5` |
| `--surface` | `#ffffff` | `#26241f` | card `bg-white` |
| `--border` | `#e8e6dc` | `#3a372f` | `#e8e6dc`, `#f3f1ea` |
| `--text` | `#141413` | `#f0eee6` | `#141413` |
| `--text-muted` | `#6b6a64` | `#a8a59a` | `#6b6a64` |
| `--text-faint` | `#9a988e` | `#7a776c` | `#9a988e` |
| `--accent` | `#d97757` | `#e08a6c` | `#d97757` (the warm clay) |
| `--accent-fg` | `#a33b2b` | `#f0a48b` | `#a33b2b` |
| `--ok` | `#4a6b2f` | `#9bb87a` | green statuses |
| `--warn` | `#8a6516` | `#d9bd7c` | amber statuses |
| `--danger` | `#a33b2b` | `#d98b7c` | red statuses |

Keep the motion tokens already in `globals.css`. Density: `[data-density=compact]` scales the spacing tokens down ~20%.

## C.6 — Master estimation & sequencing matrix

> Every task, its effort, priority, dependencies, and the phase it belongs to. A small model should pick the lowest-phase unblocked task.

| Task | Effort | Pri | Depends on | Phase |
|---|---|---|---|---|
| IP-34 CI gate | S | P0 | — | P0 |
| IP-33 hermetic test DB | M | P2→P0 | IP-34 | P0 |
| IP-10 metrics_timeseries | M | P0 | — | P0 |
| IP-25 pre-commit guards | S | P1 | — | P0 |
| IP-35 error tracking | S | P1 | — | P0 |
| IP-80 tracing | M | P1 | IP-35 | P0/P5 |
| IP-36 feature flags | S | P2 | — | P1 |
| IP-15 resilient fetch core | M | P1 | — | P1 |
| IP-01 trends | L | P1 | IP-15 | P1 |
| IP-02 SERP scrape | L | P1 | IP-15 | P1 |
| IP-04 information-gain | M | P1 | IP-02,03 | P1 |
| IP-03 semantic profiles | L | P2 | IP-02 | P1 |
| IP-17 SSE streaming | L | P1 | — | P2 |
| IP-11 GA4 conversions | M | P2 | IP-10 | P2 |
| IP-12 rank tracking | M | P2 | IP-02,10 | P2 |
| IP-06 full reopt loop | M | P2 | IP-10 | P2 |
| IP-18 planner hardening | M | P1 | — | P2 |
| IP-05 synthesis | M | P2 | IP-04 | P3 |
| IP-07 idempotent publish | L | P1 | — | P3 |
| IP-08 CMS UI | M | P2 | IP-07 | P3 |
| IP-09 article editing | M | P3 | — | P3 |
| IP-20 tokens + dark mode | M | P1 | — | P4 |
| IP-24 states audit | S | P2 | — | P4 |
| IP-21 Mission Control | L | P2 | IP-20 | P4 |
| IP-22 command palette | S | P2 | — | P4 |
| IP-48–52 a11y | S–M | P1 | IP-20 | P4 |
| IP-26 nonce CSP | M | P2 | — | P5 |
| IP-13 job_events | M | P2 | — | P5 |
| IP-14 cost ledger | S | P2 | — | P5 |
| IP-29/30/31 perf | S–M | P2/3 | IP-10 | P5 |
| IP-32 E2E | M | P1 | IP-33 | P5 |
| IP-37 alerting | S | P2 | IP-35 | P5 |
| IP-56–59 email/notif | S–M | P1 | — | P5 |
| IP-63–69 privacy/DR | S–M | P1/2 | IP-28 (some) | P5 |
| IP-46 AI Gateway | S | P2 | — | P6 |
| IP-41 internal linking | M | P2 | IP-10 | P6 |
| IP-42 cannibalization | S | P2 | IP-10 | P6 |
| IP-38 calendar | M | P2 | — | P6 |
| IP-39 competitor monitor | M | P2 | IP-02 | P6 |
| IP-47 onboarding | S | P2 | — | P6 |
| IP-28 multi-user | XL | P3 | — | P6 |
| IP-60–62 billing | M–L | P3 | IP-28 | P6 |
| IP-70–96 (analytics, search, collab, scale, API, safety, white-label, compliance, load) | S–XL | P2/3 | various | P6+ |

## C.7 — Risk register (top risks + mitigations)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scraping gets the IP bot-walled (Trends/SERP) | High | Engine stalls | IP-15 breaker + token bucket + degrade-not-lie fallback; proxy rotation as config |
| Gemini free-tier quota (1500/day) exhausted | Med | Generative agents stall | Critic quota-gate (built) + cost ledger cap (IP-14) + AI Gateway fallbacks (IP-46) |
| Neon journal drift causes a bad migration | Med | Data loss | Additive-only + idempotent rule (§0.3) + the `--@destructive-ack` CI check (IP-69) |
| Prompt injection via scraped content → bad dispatch | Med | Unwanted actions | Per-batch approval + `<UNTRUSTED_TOOL_OUTPUT>` fence (built) + planner hardening (IP-18) + autonomy levels |
| SSRF via the live-fetch agents | Low (now) | Internal exposure | `safeFetch`/`assert_public_url` (built) + DNS pinning (IP-27) |
| Single shared admin → no isolation | High (at multi-tenant) | Data leak | IP-28 multi-user + row-level scoping before any public launch |
| Live-DB tests flaky / hit prod | High | Red CI / noise | IP-33 hermetic test DB |
| Cost runaway from the engine | Med | $$$ | Feature flag (IP-36) + cost ledger (IP-14) + holdout cohort caps blast |

## C.8 — Glossary

- **Agent** — a unit of work in `registry.ts`; `fn` (inline Vercel function) or `worker` (Railway Python).
- **Checkpoint** — a human-approval gate (the `checkpoints` table + the 5-verb machine).
- **Cycle** — one research→publish run; everything carries its `cycleId`.
- **DecisionRecord** — an explainability row ("why this choice", with evidence + confidence).
- **Critic** — the binary serves/fails reviewer of producing-agent output.
- **Autonomy level (L1–L4)** — the standing guardrail envelope on how much the Director may run unattended.
- **Information gain** — the terms/subtopics the winning SERP results cover that our draft doesn't (the engine's core signal).
- **Holdout cohort** — the 10% of pages deterministically excluded from auto-action, the control arm that proves lift.
- **Anti-windup / cooldown** — the 21-day no-re-act window matching Google's recrawl dead-time, so the controller doesn't oscillate.
- **Defensive read** — a DB read wrapped to return empty on a missing table, so a deferred migration degrades gracefully.
- **Idempotent migration** — additive SQL (`IF NOT EXISTS`) safe to run repeatedly; applied directly, never via `db:migrate` blind.

---

*This plan is a living document. As tasks land, move them into `docs/platform-design.md` §0.2 (built) and strike them here. Keep `.claude/active_context.md` pointed at the current phase. New work: copy the C.1 template, satisfy the C.2 Definition of Done.*
