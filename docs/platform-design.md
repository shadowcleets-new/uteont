# Autonomous SEO Agent Platform — Architecture & Experience Design

> A multi-disciplinary specification by a Principal Software Architect, a World-Class SEO Growth Engineer, and a Senior Product Team (Information Architect · UX Architect · Interaction Designer · Product Designer). The platform ingests continuous live data, reverse-engineers competitor success, drafts and optimizes content, natively publishes to Vercel / WordPress / Shopify, and self-corrects from real-time analytics under human-in-the-loop control.

**Reference stack:** Next.js App Router on Vercel (Fluid Compute) · Postgres · Redis + BullMQ distributed queues · Python Playwright worker pool · Google Trends / Keyword Planner (Ads API) / GA4 Data API / GSC API.

> **Provenance note:** §1, §2, §5 and Appendices A–B were produced by a 12-agent design workflow (4 product-design roles + 4 engineering pillars + cross-cutting builders). §3 (DAG) and §4 (Schema) were authored directly by the lead architect after two builder agents hit a provider session cap — they are grounded in the same source drafts.

---

## 0. Implementation Reality — as of 2026-06-13

> **Read this first.** The body below is the *aspirational* design. This section
> is the ground truth: what is actually built on `main`, what diverges from the
> spec, and the capabilities added since the spec was written. Where the two
> conflict, this section wins.

### 0.1 Corrections to the spec (now factually outdated)

- **Queue substrate is Postgres, not Redis/BullMQ.** The reference stack line and
  §3/§4.2 describe "Redis + BullMQ distributed queues". The implementation is a
  Postgres-backed queue (`jobs` table; atomic claim via `SELECT … FOR UPDATE SKIP
  LOCKED` in `src/lib/services/jobs.ts`). BullMQ/Redis remains the drop-in scale
  upgrade, not a current dependency.
- **Agent count is 16, not "10".** §2 says "10 agents". The registry
  (`src/lib/agents/registry.ts`) has **16**: Research, Idea Generation, Content
  Writing, QA/Validation, SEO Optimization, Technical SEO, Content Audit, Site
  Crawl, Publishing, Backlink/Outreach, Performance Tracking, Revenue, Content
  Brief, Content Draft, **Critic (#15)**, **Tactics Scraper (#16)**. Only
  Publishing is `implemented: false`. Technical SEO / Performance Tracking /
  Revenue are all implemented (deterministic `fn` runners).
- **Job state machine has 4 states, not 13.** `jobs.status` is
  `queued | claimed | done | failed`. The rich 13-state taxonomy and the
  `job_events` append-only audit in §1/§4.4 are not built. The durability
  contract that *is* real: atomic claim + **idempotent** `completeJob`
  (guarded `UPDATE … WHERE status='claimed' RETURNING`) + exponential worker
  backoff + `result_cache` dedup.
- **Schema is a subset of the §4.1 DDL.** Built tables: sites, site_integrations,
  cycles, runs, jobs, keywords, keyword_exclusions, ideas, articles, approvals,
  notifications, agent_state, kv_settings, auth_config, login_attempts,
  conversations, messages, result_cache, targets, target_snapshots, checkpoints,
  decision_records, **critiques**, **tactics**, **campaigns**, **keyword_clusters**.
  NOT built: pages, job_events, task_checkpoints, idempotency_keys,
  publish_receipts, competitor_snapshots, content_bundles, metrics_timeseries.
- **The "autonomous SEO engine" (Pillars 2–4, §5) is a credential-free shadow,
  not the full engine.** `content-brief.ts` is the implemented realization of
  semantic profiling + information-gain + coverage gaps — but it is lexical
  (term/heading overlap on public HTML), not the embedding/NER/SERP-reverse-
  engineering engine the spec describes. `ingestAndScoreTrends`,
  `scrapeAndParseSerp`, `deployIdempotent`/`publish_receipts`,
  `checkRankAndMaybeReoptimize`, and `recalibrateFromOutcomes` are **not built**.
- **The UI is the warm-paper light theme only.** No working dark mode, no density
  toggle, no 3-zone Mission Control / PipelineLadder / RAIL-R / StatusBar, no
  LogConsole / token-stream. **DiffViewer and one-click-undo now exist** (the
  approvals diff-review + undo toast, §0.2). Reduced-motion + a shared motion-token
  vocabulary are in. The rest remains the UI backlog (see §0.3).

### 0.2 Capabilities added since the spec (built, not in the body below)

- **Critic Agent (#12 / #15 in registry).** Single-purpose reviewer: judges a
  producing agent's output against the end goal, returns a **binary serves|fails**
  verdict with one recommendation on fail; iteration cap 3 → ship-with-warning;
  quota-aware (stands down under 10% of the daily Gemini budget). Auto-runs in
  `applyJobResult`; strictness (loose/standard/pedantic) in kv_settings.
  `src/lib/services/critic.ts`, table `critiques`.
- **Tactics Scraper Agent (#13 / #16) + NotebookLM path.** Scrapes SEO/marketing
  communities (Reddit/HN/forum/blog/X) and a NotebookLM browser session
  (video→tactics, zero Gemini API calls) into a `tactics` knowledge base the
  Director reads during planning. `worker/agents/tactics_scraper_agent`,
  `worker/browser_automation/notebooklm_controller.py`, `src/lib/services/tactics.ts`.
- **Director per-batch approval (audit A-07 / LO-55).** Execution requires an
  explicit per-turn user "go"; a model-emitted `execute` without it is downgraded
  to a proposal. Closes the sticky-auto-execute prompt-injection surface. Job
  results + scraped content are fenced as `<UNTRUSTED_TOOL_OUTPUT>`.
- **Autonomy levels L1–L4 (LO-20).** A guardrail envelope on top of approval:
  L1 propose-only · L2 approval-required · L3 supervised-auto (low-blast agents
  run automatically) · L4 full-auto. `src/lib/services/autonomy.ts`.
- **Outreach domain allowlist (LO-58)**, **live QA/SEO mode (LO-04**, runs the
  linters against a fetched live URL, SSRF-guarded**)**, **GSC per-page breakdown
  (LO-29c)**, and a full **security-hardening pass** (constant-time secret
  compares, IP-keyed login lockout, CSRF Origin checks, setup-token hashing,
  idempotent job completion, generic error bodies — audit A-01…A-17).
- **Campaigns + keyword clusters (LO-36).** A campaign groups themed keyword
  clusters under one goal; `/campaigns` + `/campaigns/[id]`, tables `campaigns`
  + `keyword_clusters` (migration 0013). `src/lib/services/campaigns.ts`.
- **Counterfactual "no-intervention" ghost (LO-15).** The trajectory chart draws
  a dashed baseline of where a metric would have landed with no agent action,
  extrapolated from pre-first-intervention drift. `src/lib/services/counterfactuals.ts`.
- **Diff-review + one-click undo (LO-17/18).** Approvals lead with a +/− line
  diff of a proposed page edit (`src/lib/diff/line-diff.ts`); a terminal decision
  is undoable for 5 minutes (`canUndo`, `undoCheckpoint`, undo toast).
- **Closed-loop re-optimization trigger (LO-11).** The daily cron classifies GSC
  per-page rows into striking-distance / decayed candidates and records each as
  an explainable recommendation on `/decisions`. `src/lib/services/reoptimization.ts`.
- **Quiet-by-default attention routing (LO-21).** The dashboard leads with a
  single calm "N need you · M done" line, loud only on pending checkpoints /
  failed runs. `src/lib/services/attention.ts`.
- **Telegram inline plan approval (LO-66)**, **/cycles management UI (LO-70)**,
  **Critic verdict surfaced on Runs**, and **SSRF hardening** (redirect + DNS-
  rebinding-safe `safeFetch` across every TS and Python fetch path) +
  **length-independent secret compare** (`safeEqualDigest`), from the adversarial
  review pass.

### 0.3 The honest "still to build" list

The closed-loop re-optimization *trigger* now exists (LO-11), but the
`metrics_timeseries` substrate for full historical control, and the
**embedding/NER/SERP-reverse-engineering intelligence engine** (the real moat —
today's `content-brief` is its lexical shadow), remain unbuilt. Also unbuilt:
receipt-based idempotent **publishing + CMS clients** (`publish_receipts`,
`deployIdempotent`); the rich 13-state job machine + `job_events` audit; and the
remaining **UI system** — dark mode, density toggle, the 3-zone Mission Control /
PipelineLadder / RAIL-R / StatusBar shell, LogConsole, and token-streamed draft
rendering. (DiffViewer, one-click undo, counterfactual ghost, quiet-by-default
attention, and reduced-motion + motion tokens are now done.) The credential-gated
integrations (GSC/GA4/Slack) are built but inert until the operator sets the
secrets, and the new worker agents (Tactics Scraper, NotebookLM) need the worker
host live to run.

---

## 1. Deep-Thinking Analysis

<deep_thinking_analysis>

I'll write the Deep-Thinking Analysis now. This is the synthesis deliverable—a genuine multi-disciplinary chain-of-thought weaving the team's drafts into argument. Let me produce it directly.

## The Black Box, the Control Loop, and the Adversarial Edge: A Reasoned Synthesis

Begin with the central pathology of any autonomous agent: it acts faster than a human can audit, so trust cannot be earned the way it is between people—through observed track record—because by the time a track record exists, thousands of irreversible actions have already shipped. The four design roles are not decorating a dashboard; they are jointly discharging a *debt*. The UX Architect names it precisely as three obligations—legibility, predictability, reversibility—and the sharpest move in the entire team's thinking is the insistence that these are paid *before* the action, not reconstructed after. The DecisionRecord with its `inputs_snapshot_ref` is the load-bearing decision here: it content-addresses the exact GA4 rows, Keyword Planner payload, and scraped DOM that drove a choice, so a "why?" three weeks later rehydrates the frozen inputs, not today's drifted values. Without this, every explanation is a lie of omission. This is where IA and UX interlock: the IA's append-only `job_events` audit (invariant b) and the polymorphic `approval` attaching to either a `job` or a sentence-level `edit` are the *storage substrate* that makes the UX's forensic depth possible. Legibility is not a rendering concern; it is a schema commitment.

But legibility alone is a trap, and the team surfaces the tension honestly. The UX Architect's "quiet by default" doctrine—1,204 actions, 3 need you—directly contradicts the naive transparency instinct to show everything. A 1,204-line feed *destroys* oversight by training the operator to ignore the feed, and with it the one alert that mattered. So the real IA problem is not exposing the state machine but *ranking* it. The IxD's checkpoint state machine and the UX's `priority = blast_radius × reversibility_cost × confidence_deficit × time_pressure` are the same function viewed from two altitudes; the Product Designer then collapses both into a single Attention Queue (the RAIL-R Approval Tray) so the operator's eyes have exactly one place to rest. Here a genuine design decision resolves a tension: progressive disclosure with a *hard rule*—no autonomous action may require Forensic depth to be safely approved. If the Brief is insufficient to decide, the gate itself is mis-leveled. That rule is what prevents "transparency" from degenerating into "burden," and it is enforceable because the IA's blast-radius taxonomy (`draft=0 urls` green → `destructive` red) gives the Brief a deterministic shape.

The deeper unification is that visibility and control are the same axis. The Product Designer's Vector Chart is the keystone artifact precisely because it fuses the two: it plots the *required-slope line* (the contract: baseline → target by deadline) against the *actual progress vector* and a *projection cone whose width is confidence*. This is not a chart, it is a **setpoint visualization**—and that is the bridge to the data-flow loops.

Now map the loop literally, because hand-waving "self-correcting analytics" is where most such systems are vaporware. The Resiliency pillar specifies it as a discrete-time feedback controller. The *setpoint* is the Target's required slope (e.g., +0.9 positions/week toward position ≤3). The *plant* is Google's ranking of a published URL. The *sensor* is the 06:00 UTC GSC pull, deliberately timed after overnight finalization, computing `rank_delta_7d = median(position[d-13..d-7]) − median(position[d-6..d-0])`. The choice of *median over a finalized window* is the single most important control-theory decision in the platform: it is a low-pass filter. Comparing today vs. yesterday would feed SERP-feature jitter straight into the actuator and cause exactly the thrashing that kills SEO. The *error signal* is the trigger taxonomy—SLIP (`rank_delta_7d ≥ +3`), PLATEAU (`|delta_28d| < 1` on page 2 for ≥60d), CTR-GAP (`ctr < 0.5 × expected_ctr(position)`), DECAY (impressions −30% at flat rank). The *actuator* is the cheapest-effective-action policy: CTR-GAP triggers only a title/meta rewrite (`seo-optimization`), while SLIP escalates to competitor re-scrape and section rewrites. And critically, the loop has *anti-windup*: the 21-day `agent_state.cooldown_until`, because the plant has a 2–4 week dead-time (Google's recrawl latency). A controller that re-actuates inside the dead-time is measuring its own noise and will oscillate. The 10% deterministic-hash **holdout cohort** is the masterstroke—it is the counterfactual control arm that distinguishes "our intervention worked" from "the whole market moved," converting an open-loop guess into a closed-loop measurement. This is where the Data Engine's nightly recalibration closes the outer loop: realized GA4/GSC lift relabels the component weights `w_i` and the OS admission floor, so the *prioritization function itself* is under feedback, not just individual pages.

The loop's integrity, though, depends on a precondition the Resiliency author states bluntly and the UX author independently demands: **the agent must distrust its own inputs.** GSC anonymizes low-volume queries—they silently vanish, and treating a missing query as a rank of zero would inject a phantom error signal that drives a needless rewrite. The convention "missing = null, no signal, don't deprioritize" is a safety interlock. It rhymes exactly with the UX rule that stale-input chips desaturate with a ⟳ badge and bundle-expiry auto-voids approvals scored on 6-day-old data. Two roles, one principle: acting confidently on a broken feed is worse than halting. The escalation-to-human triggers (calibration drift, anomaly, novelty) are the loop *failing toward* manual control rather than away from it.

The third stress axis—publishing and scraping against an adversarial edge—exposes the tensions the team resolves most concretely. The Publishing pillar's hardest problem is the lost ACK: a `publish` job may be delivered or replayed any number of times, yet for a fixed `(articleId, revision)` every CMS must converge to exactly one live object. None of WordPress, Shopify, or Vercel offers a native idempotency key, so the design pushes the guarantee into a `publish_receipts` table keyed by `(articleId, revision, targetId)` carrying `contentHash` and `remoteId`. A replay with matching hash returns `noop`; a higher revision issues an *update* on the stored `remoteId`, never a create. The tension here is partial failure: a 2-of-3 multi-target publish is explicitly *not* rolled back—each target is its own idempotent unit, so forward-progress-with-disclosed-gaps beats all-or-nothing atomicity, the same bias the IxD encodes as "degraded-but-proceeding" partial badges. Vercel sharpens it: with no content API, publishing is a GitHub Contents API commit, and the file `sha` becomes an optimistic-concurrency token—a stale `sha` returns 409, so the commit itself is idempotent rather than double-applied.

Scraping inverts the adversary: now the platform is the bot being blocked. The tradeoffs are real and unresolved-by-magic. Honoring `robots.txt` and a 1-req/3s/domain token bucket is politeness that *costs throughput*; residential proxy rotation with stealth fingerprinting *buys* access but raises cost and ethical load; the official Trends API is alpha-gated and pytrends is archived, forcing a Playwright fallback that throttles at ~1 req/1.5–4s/IP. The Data Engine resolves this not by defeating the adversary but by *degrading without lying*: on Trends loss, velocity/acceleration fall back to Keyword Planner MoM deltas, `base_confidence` drops, and the corroboration bar rises—"the engine slows but never emits garbage." The circuit breaker (CLOSED→OPEN on a 429/403 spike, serving last-good `performance.json`) is the same philosophy as the controller's cooldown: when the edge is hostile, *stop hammering and surface loudly* rather than burn quota into a wall. And the IxD makes that failure honest to the operator—a `Blocked (bot wall)` tile that advances the aggregate bar on terminal states so it can never hang at 90%, refusing the fake-ETA that would quietly erode trust. The through-line across all three stress axes is identical: the system's indestructibility is not the absence of failure but the *disclosure* of it—every black box, every drifted feed, every blocked fetch resolves to a legible, reversible, human-recoverable state.

</deep_thinking_analysis>

---

## 2. Product Team Specification Matrix

The interface is an **agent control center**, not a static dashboard. Responsibilities divide across the four product-design disciplines below; each owns a layer of the human–agent collaboration surface, and together they dissolve the autonomous-agent "black box" problem.

### Information Architect (IA)

This section defines the canonical task-state taxonomy, the org→edit navigation hierarchy, and the entity model — derived from and consistent with the existing codebase (`cycles`, `runs`, `jobs`, `ideas`, `articles`, `keywords`, `approvals`, multi-site `sites`/`site_context`, and the Director Agent as natural-language single point of contact).

---

#### 1. Canonical Task-State Taxonomy

The atomic unit of work is a **Job** (a single agent task within a Run). Its `status` field is the canonical state machine below. `Run` and `Cycle` carry aggregate/rollup states (§1.4).

**1.1 Job states**

| State | Code | Description | Terminal? | Owner |
|---|---|---|---|---|
| Queued | `queued` | Persisted, awaiting claim by a worker. Has `available_at` for delayed/backoff scheduling. | No | Scheduler |
| Researching | `researching` | Live data pull: Google Trends, Keyword Planner (Ads API), GA4, GSC. | No | Research agent |
| Reverse-Engineering | `reverse_engineering` | SERP scrape + competitor teardown (Playwright worker pool). | No | Recon agent |
| Simulating | `simulating` | Pre-publish ranking/impact forecast against the cluster model. | No | Forecast agent |
| Drafting | `drafting` | Content generation (Gemini) from brief + site_context. | No | Writer agent |
| Optimizing | `optimizing` | On-page/internal-link/schema optimization passes. | No | Optimizer agent |
| Review-Required | `review_required` | Blocked on a human checkpoint; emits an `approval`. | No (parks) | Human |
| Publishing | `publishing` | Native push to Vercel / WordPress / Shopify. | No | Publisher agent |
| Verifying | `verifying` | Post-publish validation: live fetch, indexability, schema, GSC submit. | No | Verifier agent |
| Live | `live` | Published and verified; tracked for performance. | Yes (success) | System |
| Re-optimizing | `reoptimizing` | Analytics-triggered correction loop on an already-Live page. | No | Optimizer agent |
| Failed | `failed` | Retriable failure; `attempts < max_attempts`. Re-enters `queued` via backoff. | No | System |
| Quarantined | `quarantined` | Exhausted retries or poisoned; removed from auto-flow, awaits human. | Yes (halt) | Human |

**1.2 Allowed transitions**

| From → To (allowed) | Trigger / Guard |
|---|---|
| `queued` → `researching` | Worker claims job (`POST /api/jobs/claim`); `available_at <= now`. |
| `researching` → `reverse_engineering` | Research artifacts persisted. |
| `reverse_engineering` → `simulating` | Competitor teardown complete. |
| `simulating` → `drafting` | Forecast ≥ go-threshold. |
| `simulating` → `review_required` | Forecast below threshold OR policy flag → human gate. |
| `drafting` → `optimizing` | Draft artifact persisted. |
| `optimizing` → `review_required` | `requires_approval(site, action)` true (HITL checkpoint). |
| `optimizing` → `publishing` | Auto-publish allowed (no gate). |
| `review_required` → `publishing` | `approval.decision = approved`. |
| `review_required` → `drafting` / `optimizing` | `approval.decision = revise` (loop back). |
| `review_required` → `quarantined` | `approval.decision = rejected`. |
| `publishing` → `verifying` | Provider returns success + URL. |
| `verifying` → `live` | All post-publish checks pass. |
| `verifying` → `failed` | Check fails (e.g. non-indexable, schema invalid). |
| `live` → `reoptimizing` | Analytics trigger (rank drop, CTR decay, decay threshold breach). |
| `reoptimizing` → `optimizing` | Re-enters optimization pipeline. |
| any non-terminal → `failed` | Unhandled error; `POST /api/jobs/:id/fail`. |
| `failed` → `queued` | `attempts < max_attempts`; re-queued with exponential backoff. |
| `failed` → `quarantined` | `attempts >= max_attempts` (DLQ). |
| `quarantined` → `queued` | Human re-drives (manual requeue / reset attempts). |

**Invariants:** (a) `live`, `quarantined` are the only resting states reachable without human action (`live`) or requiring it (`quarantined`); (b) every forward transition writes an append-only `job_events` row (audit); (c) no transition may skip `verifying` before `live`; (d) `review_required` is the *only* state that emits an `approval` and blocks on `decision`.

**1.3 Visual state grouping (for filters/badges)**
- **Active** (animated): `researching`, `reverse_engineering`, `simulating`, `drafting`, `optimizing`, `publishing`, `verifying`, `reoptimizing`.
- **Waiting**: `queued`, `review_required`.
- **Resolved**: `live` (green), `quarantined` (red), `failed` (amber, transient).

**1.4 Run / Cycle rollup states**
- **Run.status** ∈ `{ pending, running, blocked, succeeded, partially_failed, failed, canceled }`. `blocked` ⇔ ≥1 child job in `review_required`. `partially_failed` ⇔ terminal with mixed `live` + `quarantined`.
- **Cycle.status** ∈ `{ planned, active, paused, completed, archived }`. A Cycle aggregates Runs over a planning window per site.

---

#### 2. System Hierarchy (drill-down + breadcrumb + faceting)

**2.1 Containment hierarchy (drill path)**

```
Organization
└─ Site (domain; GA4 property + GSC property + provider creds)
   └─ Target            (org-level organic-traffic objective, e.g. +30% clicks/90d)
      └─ Campaign       (strategic initiative toward a Target)
         └─ Topic Cluster   (pillar + supporting intent group)
            └─ Page          (Article ↔ published URL)
               └─ Block       (section/component within a page)
                  └─ Edit      (sentence-level internal-link / on-page change)
```

Each level is a faceted list view of its children and a detail view of itself. The **Edit** leaf is the unit a sentence-level internal-link change operates on and is individually approvable.

**2.2 Breadcrumb model**

Breadcrumb = the materialized containment path, each segment a navigable node:

```
Acme Org / shop.acme.com / +30% Organic /90d / Q3 Authority Push / "running shoes" cluster / /best-trail-shoes / §Intro / edit #1428
```

- Each segment resolves to that entity's detail route; trailing segment is the current view.
- Breadcrumb is derived from FK chain (§3), not stored, so moves/renames stay consistent.
- Sibling switcher (dropdown) on each segment for lateral navigation without losing depth.

**2.3 Faceting model**

| Scope | Facets (filterable) | Sorts |
|---|---|---|
| Targets | status, owner, time-window, on-track/at-risk | gap-to-goal, deadline |
| Campaigns | status, target, priority | projected-lift, effort |
| Clusters | intent (informational/commercial/transactional/navigational), opportunity score, coverage % | opportunity, traffic potential |
| Pages | job-state (§1.1), publish-channel, index-status, rank-band, decay-flag | clicks Δ, position Δ, last-verified |
| Keywords | intent, difficulty band, volume band, mapped/unmapped, cannibalization-flag | volume, difficulty, CTR |
| Jobs/Runs | state group (§1.3), agent type, site, attempts, has-approval | created, duration, attempts |
| Approvals | decision-status, action-type, site, risk | requested_at, SLA-remaining |

Facets are AND-composed; every list view shares one faceting component keyed by scope. Cross-scope **global search** (Director-backed) resolves free-text to entities and applies the matching facet preset.

---

#### 3. Object / Entity Model

**3.1 Core entities, keys, cardinalities**

| Entity | PK | Key fields | Parent (FK) | Cardinality |
|---|---|---|---|---|
| `organization` | `id` | name, plan | — | 1 org → N sites |
| `site` | `id` | domain, ga4_property_id, gsc_property, provider_creds_ref | `org_id` | 1 → N targets, N keywords, N articles |
| `site_context` | `id` | brand_voice, audience, constraints, vertical | `site_id` (1:1) | 1 site → 1 context |
| `target` | `id` | metric (clicks/impressions/position), baseline, goal_value, window_start/end, status | `site_id` | 1 → N campaigns |
| `campaign` | `id` | name, objective, priority, status | `target_id` | 1 → N clusters |
| `topic_cluster` | `id` | name, pillar_keyword_id, intent, opportunity_score, coverage_pct | `campaign_id` | 1 → N pages, N keywords |
| `keyword` | `id` | term, volume, difficulty, intent, cpc, mapped_page_id, cannibalization_flag | `site_id`, `cluster_id?` | N keywords → 1 cluster; 1 → 0..1 page |
| `idea` | `id` | title, rationale, source_keyword_id, score, status | `cluster_id` | 1 idea → 0..1 article |
| `article` (Page) | `id` | title, slug, url, body_ref, schema_ref, channel, index_status, rank_band, decay_flag | `cluster_id`, `idea_id?` | 1 → N blocks |
| `page_block` | `id` | type (intro/section/faq/cta), order, content_ref | `article_id` | 1 → N edits |
| `edit` | `id` | kind (internal_link/onpage/schema), anchor_text, target_url, char_range, status | `block_id` | leaf; 0..1 approval |
| `cycle` | `id` | window, status | `site_id` | 1 → N runs |
| `run` | `id` | agent_key, status, trigger, started_at, ended_at | `cycle_id`, `site_id` | 1 → N jobs |
| `job` | `id` | type, status (§1.1), attempts, max_attempts, available_at, payload_ref, result_ref | `run_id` | 1 → N job_events |
| `job_event` | `id` | from_state, to_state, reason, actor, ts | `job_id` | append-only audit |
| `approval` | `id` | action_type, decision (pending/approved/revise/rejected), risk, requested_at, decided_at, decided_by | `job_id?`, `edit_id?`, `site_id` | 1 job/edit → 0..1 |
| `keyword_metric` / `page_metric` | `id` | source (GA4/GSC), date, clicks, impressions, position, ctr | `keyword_id` / `article_id` | 1 → N (time series) |

**3.2 Key relationships (navigation + search backbone)**

- **Drill path FK chain:** `organization → site → target → campaign → topic_cluster → article → page_block → edit`. The breadcrumb (§2.2) is this chain materialized on read.
- **Execution overlay (orthogonal to content tree):** `site → cycle → run → job → job_event`. A `run` references the content entity it acts on via `payload_ref` (e.g. `article_id`, `edit_id`), linking the *execution* graph to the *content* graph without duplicating hierarchy.
- **Keyword↔content:** `keyword.mapped_page_id → article.id` (mapping); `keyword.cluster_id → topic_cluster.id` (membership); `cannibalization_flag` set when ≥2 articles map to overlapping keyword intent.
- **Measurement:** `page_metric`/`keyword_metric` time series back the at-risk/decay facets and feed the `live → reoptimizing` trigger (§1.2).
- **HITL:** `approval` polymorphically attaches to a `job` (state-gate) or an `edit` (granular sentence-level link change); `requires_approval(site, action)` decides emission.
- **Director index:** global search resolves free text → any entity via a denormalized search row `{entity_type, entity_id, site_id, label, facets[]}`, enabling the Director Agent to jump from natural language to the exact node and apply the §2.3 facet preset.

**3.3 Cardinality summary (one-line ERD)**

```
org 1─N site 1─1 site_context
site 1─N target 1─N campaign 1─N cluster 1─N article 1─N block 1─N edit
cluster 1─N keyword ; keyword 0..1─1 article (mapped_page_id)
site 1─N cycle 1─N run 1─N job 1─N job_event
job 0..1─1 approval ; edit 0..1─1 approval
article 1─N page_metric ; keyword 1─N keyword_metric
```

This model keeps the **content tree** (navigable, breadcrumb-bearing) and the **execution graph** (state machine, audit) as two linked planes sharing `site_id` as the partition key, so a user can drill from an org-level traffic Target down to a single sentence-level internal-link Edit, while every agent task remains traceable through its full state history.

I'll deliver the Trust Framework section directly, as this is a design/architecture writing task within my UX Architect role. No codebase exploration is needed since the request is for conceptual product+engineering design content.

### UX Architect

The trust contract for an autonomous agent is binary at the seam: the human delegates authority, and in exchange the agent owes **legibility** (I can see what you did), **predictability** (I know what you're about to do), and **reversibility** (I can stop or undo you). Everything below operationalizes those three debts.

---

## 1. Explainability Surfaces

Every autonomous decision emits a structured **DecisionRecord** at creation time — not reconstructed from logs after the fact. This is the atomic unit the UI renders. Reconstructed explanations are not trustworthy; the agent must commit its reasoning to the record *before* acting, so the explanation cannot drift from the action.

### 1.1 The DecisionRecord schema

```ts
DecisionRecord {
  id: string                       // ULID, sortable by time
  agent: 'keyword-scout' | 'competitor-re' | 'drafter' | 'optimizer' | 'publisher'
  decision_type: 'keyword.select' | 'competitor.adopt_structure' | ...
  subject_ref: string              // keyword_id | article_id | url
  verdict: { chosen: T, rejected: T[] }
  confidence: { score: 0..1, calibration_bucket: 'low'|'med'|'high', sample_n: int }
  evidence: EvidenceChip[]         // ordered by |contribution|
  scoring: {
    formula_id: string             // versioned, links to the exact scoring fn
    weights: Record<feature, number>
    contributions: Record<feature, number>   // signed, sums to score
  }
  counterfactuals: Counterfactual[]
  inputs_snapshot_ref: string      // content-addressed hash of frozen input data
  policy_gate: { autonomy_level: 'L0'..'L4', passed: Gate[], blocked_by?: Gate }
  created_at, model_version, prompt_version
}
```

`inputs_snapshot_ref` is non-negotiable for trust: it content-addresses (SHA-256) the exact GA4 rows, GSC query records, Keyword Planner volume/CPC payload, and scraped competitor DOM that drove the decision. When a user asks "why did you pick this?" three weeks later, the UI rehydrates the *frozen* inputs, not today's live values (which have changed). Without this, every explanation is a lie of omission.

### 1.2 Why this keyword? — the decision provenance trail

The keyword detail panel renders the trail top-to-bottom as a **chosen-vs-field** comparison, never a bare score.

**Header:** `"electric bike commuter range" — selected · confidence 0.81 (high, n=412)`

**Evidence chips** (each chip = one signal, colored by polarity, sized by contribution weight, click-to-source):

| Chip | Value | Source (live, click-through) | Contribution |
|---|---|---|---|
| Search volume | 9,900/mo | Keyword Planner `keywordIdeas`, 90-day avg | +0.22 |
| Trend slope | +34% / 90d | Google Trends `interest_over_time` | +0.18 |
| Difficulty | 41 KD | Derived: median DR of top-10 (GSC + scrape) | −0.09 |
| Intent match | commercial | Classifier v3, p=0.88 | +0.15 |
| SERP gap | 3 weak results in top-10 | Competitor RE scan | +0.20 |
| Cannibalization | none | Internal GSC URL-overlap check | +0.05 |
| CPC proxy | $1.42 | Keyword Planner | +0.04 |

Each chip expands to show the **raw payload** that produced it (the actual API response fields), the **transform** applied, and a **freshness stamp** (`fetched 2026-05-29 14:02Z, TTL 7d`). Stale-input chips (past TTL) render desaturated with a ⟳ badge — the user must never mistake a stale signal for a fresh one. This is the single most common way trust silently erodes.

**Contribution bar (waterfall):** a horizontal waterfall from baseline → final score, each segment a feature's signed contribution. This is the SHAP-style local attribution and it answers "what *actually* drove this" far better than prose. The waterfall must reconcile exactly to the score; if `Σ contributions ≠ score`, render a red integrity warning rather than fabricating a clean bar — a decomposition that doesn't add up is a bug the user needs to see, not hide.

### 1.3 Confidence that is honest

A score isn't confidence. Display three separable axes so the user can distinguish *kinds* of doubt:

- **Evidence confidence** — how strong/fresh/complete the inputs are (penalize stale chips, missing GA4 connection, low scrape coverage).
- **Model confidence** — calibrated probability from the scoring/classifier model, shown with `n` and a calibration bucket.
- **Outcome uncertainty** — predicted rank/traffic as a **range** (P10–P90), never a point estimate. "Projected +180 to +640 sessions/mo" with the interval visible.

Critically, surface **calibration drift**: if last quarter's "high confidence (0.8+)" keyword picks only ranked top-10 52% of the time, show `⚠ high-confidence picks landing 52% (target 80%)`. An agent that is *confidently wrong* is the most dangerous failure mode; the UI must make miscalibration impossible to ignore. Confidence chrome should desaturate proportionally to drift so an overconfident-but-uncalibrated agent literally looks washed-out.

### 1.4 Reverse-engineering a competitor — the evidence map

When the agent adopts a competitor article's structure, the UI shows a **side-by-side diff** of the competitor's page and the proposed brief:

- **Extracted skeleton**: H1–H3 outline, entity coverage, word count, schema types, media count, internal-link density — each annotated with the scraped source location (XPath/selector + screenshot crop) so the user can verify the agent read the page correctly.
- **Why this competitor**: ranked because `position 2 for target term · DR 58 · content age 14mo · covers 9/12 target entities`. The selection itself is a DecisionRecord with its own rejected set.
- **Gap callouts**: "Competitor covers `battery degradation`; you don't. Competitor missing `UK pricing` — proposed as our wedge." Adopt vs. differentiate is an explicit, per-section toggle.
- **Provenance integrity**: a `scrape_quality` chip (DOM completeness, bot-block detected, JS-rendered?). A competitor analysis built on a Cloudflare challenge page must be flagged, not silently trusted.

### 1.5 Counterfactuals

Render the actual sensitivity boundary, computed by perturbing inputs against the same scoring function:

- *"Would have chosen **'ebike range calculator'** if difficulty weight were ≥0.35 (currently 0.20)."*
- *"This keyword drops below threshold if volume falls under 6,400/mo — currently 9,900, with 38% headroom."*
- *"Top-3 were within 0.04 — this was a near-tie; consider reviewing manually."* (Near-ties are explicitly flagged because that's exactly where autonomous confidence is least warranted.)

The "what's the smallest input change that flips this decision" counterfactual is the highest-trust artifact in the system: it tells the user precisely how fragile the choice is.

---

## 2. Cognitive Guardrails

With N sites × hundreds of keywords × concurrent draft/optimize/publish jobs, the default failure mode is operator overwhelm → blind approval → loss of meaningful oversight. The UI's job is to **protect attention as the scarce resource** and ensure that when a human says "approve," it was a real decision and not reflexive fatigue-clicking.

### 2.1 Quiet by default

Routine successes do not notify. They are queryable, never pushed. The activity log is **append-only and collapsed**; the cockpit surfaces only **exceptions, decisions-needed, and anomalies**. An agent that narrates every success trains the user to ignore it — and they'll ignore the one alert that mattered. Silence on success *is* a feature. The single global counter "1,204 actions today · 3 need you" respects attention; a 1,204-line feed destroys it.

### 2.2 Severity-ranked attention routing

A single prioritized **Attention Queue**, not per-agent inboxes. Ranking function:

```
priority = blast_radius × reversibility_cost × confidence_deficit × time_pressure
```

- **blast_radius** — pages/sites/traffic affected (publish-to-prod ≫ draft edit).
- **reversibility_cost** — one-click-undo ≈ 0; live-publish-to-indexed-prod ≈ high; outbound API spend (Ads) ≈ high.
- **confidence_deficit** — `1 − calibrated_confidence`.
- **time_pressure** — SLA / expiring trend window / scheduled-publish countdown.

Three tiers with distinct routing channels so urgency maps to interruption cost:
- **Blocking** (red) — agent halted, awaiting human; interrupts (push/Telegram).
- **Review-soon** (amber) — proceeding but reversible within a window; batched digest.
- **FYI** (grey) — log only.

### 2.3 Progressive disclosure

Three fixed depths, same data, escalating detail — so novices aren't drowned and experts aren't throttled:

1. **Glance** — one line + status dot + confidence. ("Published 4 articles to site-A · all healthy.")
2. **Brief** — the DecisionRecord summary: verdict, top-3 evidence chips, blast radius, undo affordance.
3. **Forensic** — full provenance: raw payloads, waterfall, counterfactuals, snapshot diff, model/prompt versions.

Hard rule: **no autonomous action requires Forensic depth to be safely approved.** The Brief must carry everything a responsible approve/reject needs. If the Brief is insufficient to decide, the action isn't ready for L3 autonomy — that's a design bug in the gate, not a prompt for the user to dig.

### 2.4 Summarization and clustering

The agent **clusters** correlated events into one card: "23 keywords re-scored after GSC refresh — 4 crossed publish threshold, 19 unchanged." Never 23 line items. Clustering rules:

- Group by `(decision_type, root_cause, site)`.
- Collapse identical outcomes; surface only the **state changes** and **outliers**.
- Every cluster has a **drill-in** to the constituent DecisionRecords.

### 2.5 Blast-radius preview (the pre-flight)

Before any L3+ autonomous mutation, the agent renders a **dry-run preview the user can inspect before it fires**:

- **Scope manifest**: exact URLs created/edited, sitemap/index changes, GSC submissions, Ads spend delta, WordPress/Shopify objects touched, est. tokens/$ cost.
- **Diff view**: live content vs. proposed (for edits to existing ranked pages — these carry rank-loss risk and must always be diffed, never blind-overwritten).
- **Reversibility statement**: explicitly "**Undoable** (revision saved, 1-click revert)" vs. "**⚠ Partially irreversible** — submits URL to Google index; deindexing takes days." Irreversibility must be *named*, because the entire autonomy bargain depends on the human knowing when the safety net disappears.
- **Idempotency / collision check**: "Will skip 3 already-published; 1 conflicts with a manual edit from 2h ago — held for review." The agent must never silently clobber human work.

### 2.6 The fatigue-defeating approval

Approval UX is deliberately shaped to prevent the rubber-stamp:

- **Batch with dissent** — approve a cluster in one action, but each item is individually opt-out-able (default-in for low-risk, **default-out** for high-blast-radius). The dangerous default is never "yes to all."
- **Friction proportional to risk** — low risk: single click. High blast-radius / irreversible: typed confirmation of the scope ("publish 12 to prod") + a non-zero **undo-grace countdown** (e.g. 60s hold before execution) during which one click aborts.
- **Bundle expiry** — approvals on stale inputs auto-void. "These 4 picks were scored on 6-day-old data; re-validate before approving." You cannot approve against data the world has already moved past.

---

## 3. Human–Agent Responsibility & Authority Model

Autonomy is **per-action-class and per-site**, not a global switch. The same agent runs at L4 for drafting and L1 for production publishing simultaneously. Levels are a property of `(action_class × site × risk-tier)`, stored in the policy gate and enforced server-side — the UI only *reflects* authority; it never *grants* it, so a compromised or buggy frontend can't escalate privilege.

### 3.1 Autonomy levels

| Level | Name | Agent authority | Human role | Typical action class |
|---|---|---|---|---|
| **L0** | Manual | Suggest only; zero mutation | Does everything; agent is an advisor | New-site onboarding; legal/YMYL content |
| **L1** | Approve-each | Proposes one action + full Brief; **blocks** until explicit approval | Decides every action | Publish to indexed prod; Ads spend; schema on money pages |
| **L2** | Batch-approve | Proposes clusters; human approves in bulk with per-item opt-out | Reviews batches on a cadence | Bulk keyword selection; draft generation |
| **L3** | Supervised-auto | Acts autonomously **within a guardrail envelope**; logs; human can interrupt; **auto-pauses on threshold breach** | Monitors exceptions; sets the envelope | Re-optimization of existing drafts; internal linking; meta updates |
| **L4** | Full-auto | Acts and self-corrects; reports by exception only | Audits after the fact; owns outcomes | Trend monitoring; re-scoring; staging-only drafts |

### 3.2 The guardrail envelope (what makes L3/L4 safe)

L3/L4 are bounded by an explicit, user-visible **envelope** — autonomy is never unbounded, and the bounds are legible:

```
envelope {
  max_publishes_per_day, max_ads_spend_per_day,
  allowed_action_classes, forbidden_paths (e.g. /pricing, /legal),
  min_confidence_to_act (default 0.75),
  require_human_if: { blast_radius > X | irreversible | novel_action_type
                      | confidence < floor | calibration_drift > Y },
}
```

The envelope is shown as a live **budget meter** ("publishes 7/20 today · Ads $43/$100"). Hitting any rail does not silently stop work — it **reverts that action class to L1** and routes to the Attention Queue with the reason. Degrade safe, surface loudly.

### 3.3 When control reverts to the human (escalation triggers)

Authority snaps back to L1 (human-decides) automatically — **fail toward human control, never away from it**:

- **Confidence floor breach** — calibrated confidence < envelope floor.
- **Novelty** — an action type or competitor pattern not seen in training/history (no basis for a calibrated decision → don't fake one).
- **Calibration drift** — rolling accuracy of past autonomous decisions decays below target (the agent has *earned* a demotion).
- **Irreversibility + high blast radius** — the two-factor danger combination always stops for a human, regardless of confidence.
- **Anomaly / data distrust** — input source stale, scrape blocked, GA4/GSC auth lapsed, metric out of historical bounds. **The agent must distrust its own inputs**; acting confidently on a broken data feed is worse than halting.
- **Conflict with human action** — agent's target collides with a recent manual edit.
- **Repeated failure / oscillation** — N consecutive publish failures, or flip-flopping decisions, trip a circuit breaker into L0.
- **External-cost ceiling** — token/$ or Ads budget threshold.
- **User trust-dial** — a global per-site "supervision level" the user sets by hand; trust is **earned upward gradually, revocable instantly**. One "pause all autonomy" kill-switch reverts every site to L0 immediately, with in-flight actions caught in their undo-grace window.

### 3.4 Accountability ledger

Every action records **who held authority at execution** (`L-level`, envelope version, approving user or "autonomous"), making the responsibility boundary auditable forever. The ledger answers the question every autonomous system eventually faces — *"who decided this?"* — with: human-approved (with identity + the exact Brief shown at approval time), or autonomous-within-envelope-vN (with the envelope and DecisionRecord that authorized it). No action is ever an orphan. This is what lets a human *own the outcome* of delegated authority without having watched every step — the precondition for trusting the system at all.

Below is my section. I'm delivering it directly as the requested deliverable since the task is a self-contained design specification (no codebase investigation required, no skill matches this writing task).

### Interaction Designer (IxD)

## 1. Human-in-the-Loop Checkpoint State Machine

### 1.1 Checkpoint object model

Every approval gate is a typed `Checkpoint` rendered as a card in the review queue. The agent **blocks** on it (job moves to `WAITING_APPROVAL` in BullMQ; the worker holds a `lease` with a TTL so a stalled checkpoint auto-surfaces, never silently expires).

```ts
type Checkpoint = {
  id: string;
  runId: string;
  stage: 'keyword_intake' | 'content_plan' | 'draft' | 'page_edit' | 'deploy';
  blastRadius: BlastRadius;        // drives confirmation friction
  diff: SemanticDiff;              // see §1.4
  proposedActions: Action[];       // what executes on approve
  expiresAt: number;               // lease TTL; default 24h
  decidedBy?: string;
  decision?: 'approve' | 'reject' | 'edit' | 'request_changes';
};

type BlastRadius =
  | { kind: 'draft'; urls: 0 }                              // green
  | { kind: 'single_page'; url: string }                   // amber
  | { kind: 'bulk'; urlCount: number; sitemapPct: number } // red
  | { kind: 'destructive'; urlCount: number };             // red + type-to-confirm
```

### 1.2 The five decision verbs

State transitions out of `PENDING_REVIEW`:

| Verb | Transition | Micro-interaction | Reversibility |
|---|---|---|---|
| **Approve** | `PENDING_REVIEW → APPROVED → EXECUTING` | Primary button. On click, card collapses to a 56px **committed strip** with an inline `Undo` affordance and a live execution progress bar. | Undo window (see §1.6) |
| **Reject** | `PENDING_REVIEW → REJECTED → ARCHIVED` | Destructive-tinted; requires a one-tap reason chip (`off-brief`, `factually-wrong`, `low-quality`, `wrong-keyword`, `other→text`). Reason is fed back to the agent's next attempt as a negative constraint. | Restorable from archive < 1h |
| **Edit-inline** | `PENDING_REVIEW → EDITING → APPROVED` | Card expands to an in-place editor (ProseMirror for body, token-chip inputs for meta/title). User edits become the canonical artifact; a `human_override` flag is set so the optimizer treats edited spans as **locked** (won't re-touch on next pass). | Per-field revert to AI value |
| **Request-changes** | `PENDING_REVIEW → REVISION_REQUESTED → (agent re-runs) → PENDING_REVIEW'` | Opens a comment composer with **anchored annotations** — select a span, attach an instruction. Agent re-enters `Drafting`/`Optimizing` scoped only to annotated regions. Card shows `Revision 2` pill. | N/A (iterative) |
| **Approve-all-in-batch** | bulk transition | Only available when N checkpoints share `stage` + `blastRadius.kind==='draft'`. Long-press / shift-select → single confirm. Never offered for amber/red. | Each item retains individual undo |

State invariants:
- A checkpoint can only be acted on once; concurrent reviewers get an **optimistic lock**. Second actor sees a non-blocking toast: *"Resolved by {name} 2s ago"* and the card morphs to the committed state rather than erroring.
- `EXECUTING` failures route to `EXECUTION_FAILED` with the original diff preserved and a **Retry / Edit / Abandon** triad — the human is never asked to re-review from scratch.

### 1.3 Blast-radius confirmation — graduated friction

Friction scales with reversibility cost, not arbitrarily. Three tiers:

- **Green (drafts, 0 live URLs):** zero friction. Single click commits. No modal. This is 90% of decisions and must feel instantaneous (optimistic, <16ms visual ack).
- **Amber (single live page):** inline confirm — the Approve button performs a **2-state press** (label swaps to *"Publish to /pricing →"* on first press, executes on second within 3s, else reverts). No modal; momentum preserved.
- **Red (bulk ≥ threshold, or sitemap % > 10%, or destructive):** a **blast-radius sheet** slides up showing: exact URL count, a scrollable affected-URL manifest, the sitemap-coverage donut, and estimated traffic-at-risk (from GSC impressions on those URLs). Destructive actions additionally require **type-to-confirm** the count (e.g. type `34`). Easing: sheet enters at 320ms `cubic-bezier(.16,1,.3,1)` (decelerate) so it reads as *deliberate*, not alarming.

The confirmation copy always states the **undoable horizon**: *"Reversible for 10 min via one-click rollback (Vercel instant rollback / WP revision restore)."*

### 1.4 Diff review of proposed page edits

The diff is the heart of trust. We render **three synchronized views** behind a segmented control, defaulting to whichever matches the artifact:

1. **Rendered diff (default for body content):** the page rendered twice, side-by-side on desktop / swipeable on mobile, with added blocks haloed green, removed blocks struck red-on-rose, moved blocks tagged with a ↕ handle. Hovering a change scrolls the counterpart view to the same anchor (linked scroll).
2. **Semantic diff (default for SEO metadata):** field-level, not character-level. Shows `title`, `meta description`, `H1`, `canonical`, `schema.org` JSON-LD, internal-link graph deltas as discrete rows with before → after and an **impact tag** (e.g. *"title 71→58 chars ✓ within SERP limit"*, *"+3 internal links to /cluster-hub"*). Each field independently approvable.
3. **Raw diff (escape hatch):** monospace unified diff for power users / debugging, with syntax highlighting for HTML/JSON-LD.

Critical micro-interactions:
- **Granular accept/reject**: every change hunk has a hover-revealed ✓/✗. Rejecting one hunk doesn't reject the checkpoint — it mutates `proposedActions` and recomputes the blast radius live.
- **"What changed & why" rail**: each hunk links to the agent's rationale (the SERP/competitor signal that motivated it) in a right rail, so the diff isn't a black box. Lazy-loaded; renders a 1-line skeleton until fetched.
- **Schema/structured-data changes** get a validity badge (validated against schema.org types client-side) — invalid schema **blocks approve** with an inline error, not a post-hoc failure.

### 1.5 One-click undo

Undo is a first-class, **always-visible** affordance for any executed action, not a hidden Ctrl-Z:

- After `EXECUTING` completes, the committed strip shows **`Undo` for a 10-minute window** with a thin depleting progress ring (not a ticking countdown number — rings read as calm, numbers read as pressure).
- Undo maps to the platform's native reversal: **Vercel** → instant rollback to prior deployment alias; **WordPress** → restore prior revision via REST `wp/v2`; **Shopify** → revert via stored `before` snapshot. The platform difference is abstracted — the user sees one **Undo**.
- Clicking Undo is itself optimistic: the strip immediately flips to *"Rolling back…"* then *"Restored"*, with the original checkpoint **re-materializing** in the queue as `PENDING_REVIEW` so the human can re-decide. Failure to roll back escalates to a toast with a manual-link fallback.
- Beyond the 10-min window, the action moves to **Version History** (per-URL timeline) where rollback still exists but behind a normal confirm (no longer "one-click", because it's no longer the obvious recent mistake).

### 1.6 Undo timing model

| Action tier | One-click undo window | Easing of the depletion ring |
|---|---|---|
| Draft-only | n/a (nothing shipped) | — |
| Single page | 10 min | linear |
| Bulk publish | 15 min | linear, ring turns amber at 80% elapsed |
| Destructive | 30 min + snapshot retained 7d | linear |

---

## 2. Real-Time Micro-Interactions

Design principle: **every stream has a skeleton, a steady state, a backpressure state, and a terminal state.** No spinner ever spins with zero information.

### 2.1 Streaming agent logs

- **Transport:** SSE (or WS) → an append-only virtualized list (windowed; only ~50 rows in DOM). Logs are **semantic, not raw stdout** — each line is a typed event (`tool_call`, `api_response`, `decision`, `warning`, `retry`) with an icon, monospace detail, and a relative timestamp that re-renders to absolute on hover.
- **Arrival animation:** new lines fade+slide in over **120ms ease-out**, capped: if > 8 lines land in one frame, we **disable per-line animation** and flash a subtle top-edge highlight instead — prevents the "slot-machine" flicker under burst.
- **Backpressure:** when inbound rate exceeds render budget, a **coalescing banner** appears: *"⏬ 142 new lines"* — clicking jumps to tail. Auto-scroll **pauses the instant the user scrolls up** (sticky "Resume ▼" pill at bottom-right); this is the single most important log interaction — never yank the viewport.
- **Grouping:** repeated retries collapse into a single expandable row (*"Retry ×3 — GSC 429, backing off 2s/4s/8s"*) so a flapping API doesn't drown the narrative.
- **Filtering:** severity chips (`all · decisions · warnings · errors`) filter without refetch; default view hides `api_response` noise, surfaces `decision` + `warning`.

### 2.2 Live SERP-scraper feeds

The Playwright pool scraping competitors is the most "alive" surface — make the work visible to build confidence:

- **Per-target tiles**, one per competitor URL in flight, each showing: favicon, URL, and a state lozenge cycling `Queued → Fetching → Parsing → Done/Blocked`. A tile populates **progressively** — title fills first, then word count, then extracted headings/entities — each datum fading in as it lands (optimistic incremental render, ~150ms ease-out per field).
- **Aggregate progress**: a compact header *"Analyzed 7 / 12 competitors"* with a determinate bar; ETA shown only once ≥3 samples exist (median fetch time), else *"estimating…"* — never a fake ETA.
- **Failure states are honest**: `Blocked (bot wall)`, `Timeout`, `CAPTCHA` render as amber tiles with a **Retry via residential proxy** action and do **not** stall the aggregate — the bar advances on terminal states (success *or* failure), so it can't hang at 90%.
- **Live SERP positions** (from GSC / scrape) animate rank changes with a brief ↑/↓ slide + color pulse (green up / red down), then settle to neutral within 1.5s so the board doesn't stay loud.

### 2.3 Token-streamed draft rendering

- **Skeleton-first:** on draft start, render the **document skeleton from the approved outline** (H2/H3 placeholders as shimmer bars at real heading widths). Tokens then **fill into the correct section**, so the reader sees structure before prose — far less anxious than a single growing blob.
- **Token cadence:** stream into a block that renders markdown **incrementally**; a soft **caret** (1.1s blink, ease-in-out) marks the write head. We **debounce markdown re-parse to ~60ms** so partial syntax (`**bold`) doesn't flash malformed — buffer until a token boundary resolves.
- **Optimistic block states:** each section carries a status dot — `streaming` (pulsing) → `complete` (solid) → `optimizing` (the SEO pass re-touches it; changed phrases briefly underline-sweep). Sections already done stay **stable** while later ones stream — no reflow j. We reserve layout height from the skeleton to prevent jumps.
- **Backpressure / stall:** if the model stalls > 2s mid-stream, the caret morphs to a **breathing dot** and a quiet *"…thinking"* appears — distinct from an error. If the provider errors, the partial draft is **preserved**, the section dot turns amber, and a **Resume** appears (regenerate from last good token), never discarding written text.
- **Cost/length meter:** a live word-count + reading-time + token-budget bar fills as it writes, turning amber near the target length so overruns are visible in-flight, not after.

---

## 3. Agent State-Transition Choreography

`Researching → Drafting → Optimizing → Deploying → Verifying`

### 3.1 The spine: a horizontal stepper that *flows*

A persistent 5-node pipeline rail (top of the run view). Design intent: it should read like a **circulatory system, not a progress bar** — motion conveys liveness without implying a fixed % that then lies.

- **Active node** breathes: a 2.4s ease-in-out scale pulse (1.0→1.04) + a soft directional **flow gradient** animating *toward the next node* (subtle, 8s loop) — signals "work is moving downstream" even when a sub-task has no determinate progress.
- **Completed nodes** snap to solid with a single 200ms check-draw; the connector behind them fills solid. No lingering animation — done things must look **quiet and trustworthy**.
- **Pending nodes** are low-contrast outlines. The rail never shows a fake global percentage; it shows **which stage** + that stage's own determinate sub-progress when available (e.g. *Researching: 7/12 competitors*).

### 3.2 Per-state look & feel

| State | Visual signature | Motion intent | What it must NOT do |
|---|---|---|---|
| **Researching** | Cool blue node; SERP tiles + log feed populate beneath. Sub-metric: competitors analyzed, keywords pulled. | Scanning, outward — data flowing *in*. Tiles stagger-in 60ms apart. | Imply completeness before all sources return. |
| **Drafting** | Indigo; document skeleton + token stream beneath. Sub-metric: words / target. | Generative, downward fill. Caret + section dots. | Reflow or flash malformed markdown. |
| **Optimizing** | Violet; the draft stays visible while changed spans **underline-sweep** as SEO/entity passes apply. Sub-metric: SEO score climbing toward target. | Polishing — left-to-right sweeps over existing text, score gauge easing up. | Re-touch human-locked spans (§1.2). |
| **Deploying** | Amber; platform target chips (Vercel/WP/Shopify) flip `Queued→Pushing→Live`. Sub-metric: build/CDN propagation. | Committal, purposeful. Slightly slower, weightier easing (decelerate) to read as *consequential*. | Hide which platform / which URL. |
| **Verifying** | Teal; live checks light up a checklist (200 OK, Lighthouse, schema valid, indexable, GSC submitted). Sub-metric: checks passed/total. | Settling, confirmatory. Each check **ticks** in as it returns. | Declare success before all critical checks pass. |

### 3.3 Uncertainty, retries, and stalls — without anxiety

The core philosophy: **distinguish "working" from "stuck" from "failed" with three visually distinct, non-alarming languages.**

- **Working (determinate):** determinate bar / counter. Calm, forward.
- **Working (indeterminate):** the **breathing** node + flow gradient. *Never* a barber-pole spinner (reads as hung). A passive elapsed timer appears only after a stage exceeds its **p50 duration** — informational, not red.
- **Retry:** the node shows a small **orbiting dot** + a count badge (`↻2`). Inline log explains the cause and backoff. The node color stays its stage color (not red) — retries are **expected**, so they must look routine. Only after `maxRetries` does it escalate.
- **Stall (exceeds p95 / lease at risk):** node tints amber, gentle 1.5s pulse (slower = less panic), banner: *"Researching is taking longer than usual — competitor site slow. Still working."* with **Keep waiting / View logs / Skip this source**. The user is given agency, not just a spinner.
- **Failure (terminal):** node turns red with a **single** attention pulse then **settles to static red** (no looping animation — looping red = alarm fatigue). Surfaces the **Retry / Edit inputs / Abandon** triad and a plain-language cause. The pipeline **does not collapse** — completed stages remain, so the human resumes from the break, never from zero.
- **Degraded-but-proceeding:** if a non-critical source fails (one competitor blocked, GA4 lag), the stage completes with a **partial badge** (*"deployed · 1 verify check skipped"*) rather than blocking — the system favors forward motion with disclosed gaps over hard stops.

### 3.4 Cross-cutting anti-flicker & timing rules

- **Minimum visible duration:** any state shown ≥ **400ms** even if it resolves faster, so fast successes don't strobe. Transitions between nodes cross-fade over **240ms**.
- **No layout shift on update:** all streaming regions have reserved min-heights from their skeletons; counters use **tabular-nums** so ticking digits don't jitter width.
- **Easing vocabulary (intentional, consistent):**
  - *Entrances / data arriving:* `ease-out` 120–180ms (quick in, gentle settle).
  - *Approval/deploy commits:* `cubic-bezier(.16,1,.3,1)` 240–320ms (decelerate = weight, deliberation).
  - *Breathing/liveness loops:* `ease-in-out` 1.5–2.4s (organic, slow).
  - *State cross-fades:* 240ms.
- **Reduced-motion:** `prefers-reduced-motion` swaps every loop/pulse/sweep for opacity-only crossfades and static state badges; meaning is **never** carried by motion alone — color + icon + label always co-encode state for accessibility.
- **Sound/haptic (optional):** a single soft haptic on `Deploying→Live` and on a **failure** only — never on routine streaming — so the one buzz that matters isn't diluted.

I now have the complete, real domain model. I'll write the Product Designer section grounded entirely in this codebase: the 10 agents and their `fn`/`worker` runtimes, the five approval gates A-E, the Director intent machine (ask/propose/execute/report), every status enum, the real metric fields (`qaScore`, `seoScore`, `competitionScore`, `searchVolumeEstimate`, `priorityRank`), the job/run telemetry, and the existing color tokens (#d97757 clay, #788c5d sage, #6a9bcc blue, #a33b2b rust, #141413 ink, #faf9f5 paper). I'll map the Target Control Panel's progress vector against the real signals the system actually emits (GSC rank from the Performance Tracking Agent, content throughput, gate decisions).

### Product Designer

The control center is a **command surface, not a dashboard**. The operator states an absolute objective in natural language to the Director, then watches a single 10-agent pipeline drive toward it. Every pixel serves one of three jobs: (1) show where the agent *is* against the target, (2) show what it's *doing right now*, (3) surface the *one decision* a human must make next (the A–E gates). The visual language is the existing UTEONT palette — warm paper, ink, clay-orange action — extended into a dense, instrument-grade operations skin.

---

#### 1. Unified Visual Language & Workspace

**Layout regions** (persistent 3-zone frame; the center swaps per route, rails are global):

```
┌──────────┬─────────────────────────────────────────┬───────────────┐
│ RAIL-L   │  CANVAS  (route view)                    │ RAIL-R        │
│ 224px    │  fluid, max-w 1180px, density-tunable    │ 320px         │
│          │                                          │               │
│ Site     │  ┌─ TARGET HEADER (sticky, 88px) ──────┐ │ APPROVAL TRAY │
│ switcher │  │ objective · ETA · slope · confidence│ │ (gate queue)  │
│ ──────── │  └─────────────────────────────────────┘ │ ───────────── │
│ Director │                                          │ ACTIVITY      │
│ Pipeline │  view body                               │ (job/run      │
│  1.Resrch│                                          │  live feed)   │
│  2.Ideas │                                          │ ───────────── │
│  …10.Rev │                                          │ INTERVENTIONS │
│ ──────── │                                          │ (alerts)      │
│ Cycles   │                                          │               │
│ Settings │                                          │               │
└──────────┴─────────────────────────────────────────┴───────────────┘
              STATUS BAR (24px): DB · worker heartbeat · queue depth · model/cost budget
```

- **RAIL-L (navigation + agent state).** The 10 agents render as a vertical **pipeline ladder** in execution order (`1. Research → 10. Revenue Optimization`), not a flat menu. Each rung carries a runtime glyph (`fn` = lightning, `worker` = browser), a live state dot, and a thin throughput bar. Unimplemented agents (`technical-seo`, `publishing`, `performance-tracking`, `revenue`) render at 45% opacity with a "planned" tag so the operator always sees the *whole* machine, including what isn't wired yet. The Site switcher pins to the top — every entity is site-scoped, so this is the highest-frequency context control.
- **CANVAS.** Owns the active route. Always opens under the **Target Header** so the objective and the progress vector are visible regardless of which view (Mission Control, agent detail, cycle board, article diff) is loaded. Max content width 1180px; the header is `position: sticky` so the vector never scrolls away.
- **RAIL-R (the human-in-the-loop column).** Three stacked panels in priority order: **Approval Tray** (gates A–E waiting on a decision — the single most important thing on screen), **Activity** (live `jobs`/`runs` feed), **Interventions** (plateau/slip/budget/quota alerts). This rail is where the operator's attention lives during autonomous runs; it answers "do I need to do anything?" without a route change.
- **STATUS BAR.** Infrastructure truth, always-on: DB reachability (already surfaced on the current dashboard), worker pool heartbeat + last-claim age, BullMQ/Redis queue depth per agent, and the model-router daily **cost/quota budget** gauge (Gemini free-tier remaining). When the worker heartbeat exceeds 90s or quota crosses 80%, this bar is the early-warning line.

**Density.** Three tiers via a single toggle, because a 3-keyword smoke test and a 400-article site have opposite information needs:
- *Comfortable* — 14px body / 44px rows. Onboarding, single-cycle.
- *Compact* — 13px / 32px rows. Default for operators.
- *Console* — 12px mono / 26px rows, tabular numerals, hairline grid. For the log console and large keyword/article tables.

**Color semantics for state.** One token = one meaning, everywhere (reuse the codebase tokens so light/dark share intent):

| Token | Light / Dark hex | Meaning — bound to real state |
|---|---|---|
| **Clay** `#d97757` / `#e08a6a` | **Action / executing.** Director `intent:"execute"`, job `status:"claimed"`, agent actively running. Primary buttons. |
| **Sage** `#788c5d` / `#9ab17e` | **Healthy / done / approved.** `intent:"report"`, job/run `done`, article `published`, gate `approve`, on/above trajectory. |
| **Blue** `#6a9bcc` / `#7fb0e0` | **Proposed / pending human.** Director `intent:"propose"`, approval `pending`, idea `proposed`, article `staged` (awaiting gate C). |
| **Rust** `#a33b2b` / `#d4604f` | **Error / blocked / slip.** Job `failed`, gate `reject`, target slipping below required slope, quota exhausted. |
| **Amber** `#c89a3c` / `#d9b15a` | **Warning / attention.** Plateau, retry in progress (`attempts < maxAttempts`), cooldown active, budget 80–100%, confidence band widening. |
| **Stone** `#9a988e` / `#7d7b73` | **Idle / neutral / planned.** `queued`, `researched`, unimplemented agents, system messages. |
| **Ink** `#141413` / paper `#ECEAE3` | Primary text / inverse. |

Each state also carries a **shape/label**, never color alone (filled dot = running, ring = pending, check = done, slash = blocked, triangle = warning) — the operator must read state correctly while colorblind or glancing.

**Dark/light.** Light = warm paper `#faf9f5` canvas, white cards, the day default. Dark = ink `#1a1a18` canvas, `#232320` cards, `#2e2d29` hairlines — built for the always-on wall monitor where an autonomous run is babysat overnight. Same semantic tokens, luminance-lifted ~12% in dark so the clay "executing" pulse stays legible. The **state dot is the anchor element**: identical position, size, and meaning in both themes.

---

#### 2. The Actionable Target Control Panel

The center of gravity. The operator sets one absolute objective; the panel renders the **progress vector** against the **required trajectory** and tells them exactly when to intervene.

**Objective definition.** A structured strip parsed from the natural-language goal (the Director already extracts `conversation.goal`), with each field editable as a chip:

```
TARGET  [Rank ▾]  for  [ "B2B textile manufacturing" ]  →  position [ ≤ 3 ]
        on  [ site: acme-textile.com ▾ ]   by  [ 2026-07-29 ]  (60d)
        baseline: pos 47 (GSC, 2026-05-30)        cycle: #18
```

Objective *types* map to the metric the system can actually measure:
- **Rank** → GSC average position for the query (Performance Tracking Agent, daily cron).
- **Coverage** → count of `articles.status = "published"` against a keyword cluster target.
- **Traffic** → GA4 sessions / GSC clicks for the target page set.
- **Authority** → referring domains from accepted gate-E outreach.

Each carries its own *required slope*; the operator never converts intent to metrics by hand.

**The Vector Chart (hero, ~560×320).** A time-series plotting four series — this is the screen's signature instrument:

1. **Required-slope line** (stone, dashed) — straight line from `baseline` at start date to `target` at deadline. The contract.
2. **Actual progress vector** (clay→sage gradient: clay while below the line, sage once at/above) — measured metric over time. Stepped, because rank/coverage move in discrete jumps when an article publishes or the cron refreshes.
3. **Projection cone** (translucent fill) — linear-regression extrapolation of recent velocity to the deadline. **Width = confidence**, narrowing as more datapoints land. Cone *centerline* hits the deadline axis at the **projected value**; where it crosses the target threshold is the **projected ETA**.
4. **Intervention markers** — vertical ticks where the operator acted (gate approvals, a re-research dispatch, a new article published), so cause↔effect on the curve is legible. Hover a tick → "Gate B approved · article #213 published · +6 positions over next 4 crawls."

**Readouts** flanking the chart (the four numbers an operator actually steers by):

```
┌ PROJECTED ETA ┐ ┌ REQUIRED vs ACTUAL ┐ ┌ CONFIDENCE ┐ ┌ STATUS ┐
│  Jul 22       │ │ slope  +0.9/wk req │ │   72%      │ │ ON     │
│  7d ahead ▲   │ │ actual +1.3/wk  ▲  │ │ ±5 pos     │ │ TRACK  │
│ (sage)        │ │ (sage)             │ │ (amber)    │ │ (sage) │
└───────────────┘ └────────────────────┘ └────────────┘ └────────┘
```

- **Projected ETA** vs deadline: ahead (sage ▲) / behind (rust ▼) / dead-on (sage =). The number that answers "are we going to make it?"
- **Required vs actual slope**: the two velocities compared directly. Actual ≥ required → sage; actual < required → rust with the **deficit** ("need +0.4 pos/wk").
- **Confidence**: regression R² → band tier (High ≥0.8 narrow / Medium 0.5–0.8 / Low <0.8 wide). Few datapoints = explicit *"Low confidence — 3 datapoints"* rather than a falsely tight cone. Honesty over false precision.
- **Status pill**: the one-glance verdict — **ON TRACK / AHEAD / AT RISK / SLIPPING / PLATEAUED / BLOCKED**.

**Alert logic (drives the Status pill + RAIL-R Interventions):**
- **Plateau** — actual slope ≈ 0 across ≥3 consecutive measurement windows while still below target. Amber. *"Rank flat at pos 14 for 9 days. Likely content-quality or backlink ceiling."* → suggested action: dispatch Research re-scan or open gate-E outreach.
- **Slip** — actual line crosses below required line, or projected ETA passes the deadline. Rust. *"Projected ETA Aug 4 — 6 days late."* → suggested intervention with a one-click Director hand-off.
- **Stall (pipeline)** — no `runs` for the target's cycle in N hours though work remains (e.g., articles stuck in `draft`, gate B unattended). Amber. Points at the bottleneck agent/gate.
- **Quota/budget** — Gemini free-tier exhausted; clay agents can't draft. Rust. *"Content Writing paused — daily model quota hit. Resets 00:00 UTC."*
- **Blocked** — a gate has been pending > SLA. The vector can't advance until the human decides; the panel says so plainly and deep-links the Approval Tray.

**Intervention points** are first-class, not buried. Every alert renders a **suggested action button** that pre-fills a Director dispatch: *"Re-run Research with broader seeds," "Approve 3 staged drafts → publish," "Open outreach to top 5 referring-domain gaps."* One click drops the operator into the chat with the proposal staged — closing the loop from *diagnosis* → *correction* without leaving the panel. This is the core promise: the UI doesn't just chart the gap, it hands you the lever.

---

#### 3. Key Screens

**A. Mission Control** (`/`, the new home — supersedes the current static agent grid). Target Header with the live vector for the active objective; RAIL-R hot. CANVAS below shows the **pipeline flow strip** — the 10 agents as connected nodes with counts moving between them (`12 keywords → 4 ideas → 2 drafts → 1 in QA → 1 staged`), so the operator sees *where work is pooling*. Stat tiles (Agents Live, Total Runs, DB) carry over but gain a fourth: **Target health**.

**B. Target Detail.** The Vector Chart full-bleed + the **measurement log** (every GSC/GA4 datapoint with delta and the run that triggered the refresh) + the **intervention history** (gate decisions + Director dispatches that moved the curve). The audit trail of *how* the agent is chasing the goal.

**C. Director Console** (existing `/chat`, elevated). Keep the proven 3-pane chat. Add: (i) **intent badges** already exist (ask/propose/execute/report) — promote them to drive a **mini progress chip** in the thread header so the conversation shows target movement inline; (ii) an **execution timeline** beneath any `execute` message rendering each enqueued job's live status (`queued → claimed → done`) with the job id, so a dispatch isn't a dead receipt but a tracked fan-out; (iii) the approval-required affordance — when a dispatch hits gate B/C/E, the proposal renders as an inline **approval card** answerable without leaving chat.

**D. Cycle Board.** Kanban across the real `cycles` status enum (`researching → ideas-ready → drafting → qa → staged → published → archived`); cards are keywords/ideas/articles carrying `qaScore`/`seoScore` chips and their gate state. Drag = request a status transition (still gated server-side).

**E. Agent Detail** (`/agents/[key]`). Per-agent run history, current `agent_state` (paused, `cooldownUntil`, last run), throughput sparkline, and the agent's queue slice. For `fn` agents: latency/error rate. For `worker` agents: claim latency + Playwright session health.

**F. Approval Center.** Full-page expansion of the tray — all five gates with target/diff/context. Maps exactly to `approvals` (gate A–E, decision approve/reject/edit, channel web/telegram).

---

#### Component Inventory

| Component | Purpose | Bound to |
|---|---|---|
| **VectorChart** | Hero target instrument: required slope, actual vector, confidence cone, ETA, intervention ticks | GSC/GA4 series, `cycles`, `articles` |
| **StatusPill** | One-glance verdict ON/AHEAD/AT RISK/SLIPPING/PLATEAUED/BLOCKED | Alert engine |
| **TargetHeader** | Sticky objective strip + 4 readouts | `conversation.goal`, metric feed |
| **PipelineLadder** (rail) | 10 agents in exec order, runtime glyph, state dot, throughput bar | `AGENTS`, `agent_state`, `jobs` |
| **PipelineFlowStrip** | Horizontal node graph; counts flowing between stages | entity status counts |
| **StateDot** | Atomic state token (shape+color), theme-stable | every status enum |
| **AgentCard** | Agent summary (exists — extend with state dot + queue depth) | `AGENTS`, stats |
| **EntityCard** | Keyword / idea / article card with score + gate chips | `keywords`, `ideas`, `articles` |
| **ScoreChip** | `qaScore` / `seoScore` / `competitionScore` mini-gauge, threshold-colored | article/keyword fields |
| **JobChip / RunRow** | Live job lifecycle (`queued→claimed→done→failed`), attempts, retry | `jobs`, `runs` |
| **ActivityFeed** (rail) | Reverse-chron run/job stream | `runs`, `jobs` |
| **ApprovalCard / ApprovalTray** | Gate decision unit (approve/reject/edit + note) | `approvals`, gates A–E |
| **InterventionAlert** | Plateau/slip/stall/quota alert **with one-click suggested Director action** | alert engine → Director dispatch |
| **DiffViewer** | Side-by-side article body / meta / change diff for gate review | `articles`, `qaReport`, `seoReport` |
| **LogConsole** | Console-density structured run log, level-colored, filter by agent/cycle | `runs.result`, `jobs.error` |
| **IntentBadge** | ask / propose / execute / report (exists — promote to shared) | Director payload |
| **ExecutionTimeline** | Fan-out of jobs spawned by one `execute` | `messages.payload.enqueued` |
| **Timeline** | Vertical event history (cycle / target / approval) | `runs`, `approvals`, `messages` |
| **BudgetGauge** (status bar) | Model quota / cost remaining; pauses clay agents at 100% | model router state |
| **DensityToggle / ThemeToggle** | Comfortable/Compact/Console · light/dark | UI pref |
| **SiteSwitcher** (rail) | Active site scope for all entities | sites (per multi-site model) |

**Bottom line:** the operator types one sentence, approves one plan, and thereafter reads one chart and one rail. The Vector Chart turns an abstract objective into a slope they can see the agent climbing; the Approval Tray and Intervention alerts are the only things that ever demand their hands. Everything else — 10 agents, the queue, the gates, the cost budget — runs underneath and reports up through a single, color-disciplined state language.

---

## 3. Data Flow & Pipeline DAG Diagram

**Legend.** Solid arrows (`──▶`) are the forward execution path; double arrows (`══▶`) cross a durable BullMQ queue boundary (work is persisted before the next stage runs); dashed arrows (`╌╌▶`) are the closed-loop analytics feedback that re-drives the planner. `◇` marks the Human-In-The-Loop gate. Every queue has a paired retry/back-off path and a dead-letter queue (DLQ); every external call is wrapped by the idempotency ledger so a replay never double-writes. The whole graph is a control loop: GA4/GSC telemetry is the *measured variable*, the per-page Target slope is the *setpoint*, and the Optimizer is the *controller*.

```
                              EXTERNAL SIGNAL SOURCES (polled on cron + on-demand)
        ┌───────────────┬────────────────────┬──────────────┬──────────────┬───────────────────┐
        │ Google Trends │ Keyword Planner     │  GA4 Data    │  GSC Search  │  Live SERP        │
        │  (velocity)   │ (Ads API: vol/CPC)  │  API         │  API         │  (HTML/schema)    │
        └──────┬────────┴─────────┬──────────┴──────┬───────┴──────┬───────┴─────────┬─────────┘
               │ trend ts          │ intent+difficulty │ engagement   │ impr/clicks/pos │ raw DOM
               ▼                   ▼                   ▼              ▼                 ▼
        ┌────────────────────────────────────┐                ┌────────────────────────────────┐
        │  INGESTION + SCORING SERVICE        │                │  COMPETITOR RECON (Playwright   │
        │  velocity·accel·intent → opp_score  │                │  worker pool + proxy rotation)  │
        │  dedup · freshness-weight           │◀──need-recon───│  parse: entities·schema·links   │
        └───────────────┬────────────────────┘                └───────────────┬────────────────┘
                        │ opp_score ≥ admit_threshold                          │ competitor_snapshots
                        ▼                                                      ▼
        ┌──────────────────────────────────────────────────────────────────────────────────────┐
        │                          AGENT BRAIN — PLANNER (Director)                              │
        │  builds Runs from Targets/Campaigns/Clusters · assigns autonomy level L0–L4 · enqueues │
        └───────┬──────────────────────────────────────────────────────────────────────────────┘
                ║ enqueue Job {idempotency_key}                          ▲           ▲
                ▼                                                        ║ requeue   ╎ re-optimize
   ╔════════════════════════════ REDIS / BullMQ DISTRIBUTED QUEUES ═════════════════════════════╗
   ║  q:research → q:recon → q:simulate → q:draft → q:optimize → q:publish → q:verify           ║
   ║  each: concurrency cap · exp back-off · jobId dedup · attempts<max → retry, else → DLQ ─────╫─▶ ☠ DLQ
   ╚════╤═════════════╤══════════════╤═══════════╤════════════╤═══════════════════════╤═════════╝     (quarantine)
        ▼             ▼              ▼           ▼            ▼                         ▼
   [Research]──▶[Reverse-Eng]──▶[Simulate]──▶[Draft]──▶[Optimize]──▶◇ HITL GATE ──▶[Publish]──▶[Verify]
    GSC/Trends   info-gain        rank          Gemini    on-page/      review_required   fan-out    live-fetch
    pull         + gap model      forecast      draft     schema/links  approve│revise│reject        indexable?
                                     │                          │          │      │     │              │
                                     │ below go-threshold ───────┘          │      └▶back to Draft/Optimize
                                     └────────────────────▶ ◇ HITL GATE ◀───┘             │ rejected → ☠
                                                                                          ▼
                                            ┌─────────────────── DECOUPLED PUBLISHER (idempotent adapters) ───────────────────┐
                                            │   ContentBundle ─▶  Vercel adapter   │  WordPress adapter │  Shopify adapter     │
                                            │                     git commit /     │  REST/GraphQL,     │  Admin API → blog/   │
                                            │                     ISR revalidate   │  media sideload,   │  collection/product, │
                                            │                     /JSON write      │  draft→live        │  template-schema map │
                                            └──────────┬──────────────────┬──────────────────┬──────────────────────────────┘
                                                       ▼ 200+URL          ▼ 200+URL           ▼ 200+URL
                                                  publish_attempts(ledger) — partial fail ⇒ resume from last checkpoint
                                                       └──────────────┬───────────────────────┘
                                                                      ▼
                                                            [Verify] ──▶  LIVE PAGE (status=live)
                                                                                │
                                                                                │ URL registered for tracking
                                                                                ▼
        ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌  CLOSED-LOOP FEEDBACK  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
        ╎                                                                                          ╎
        ▼                                                                                          ╎
   ┌─────────────────────────────────────────────┐        ┌──────────────────────────────────────┴───┐
   │  ANALYTICS RE-INGEST (GA4 + GSC, daily cron) │───────▶│  DECAY / SLIP DETECTOR                    │
   │  metrics_timeseries: impr·CTR·pos·engagement │ deltas │  pos↓ ≥ Δ  OR  CTR-decay  OR  plateau     │
   └─────────────────────────────────────────────┘        │  vs Target slope (setpoint) → trigger     │
                                                           └──────────────────┬───────────────────────┘
                                                                              ╎ reoptimize Job
                                                                              └╌╌╌╌▶ back to PLANNER (top)
```

---

## 4. Backend & Database State Schema

The system is built for **crash-safe, long-running, resumable** work. Three principles govern the schema: (1) **every side-effecting step is journaled before and after it runs** (the `task_checkpoints` step-ledger); (2) **every external write is guarded by an `idempotency_keys` row** so a replay returns the prior result instead of duplicating it; (3) **the canonical task state machine lives in Postgres**, while Redis/BullMQ holds only ephemeral scheduling — the DB is the source of truth, so a total Redis flush loses zero durable state.

### 4.1 Core tables (Postgres, abbreviated DDL)

```sql
-- ── Strategy hierarchy (mirrors the IA drill-down: Target→Campaign→Cluster→Page) ──
CREATE TABLE targets (
  id            BIGSERIAL PRIMARY KEY,
  site_id       BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  metric        TEXT NOT NULL,                 -- 'clicks' | 'impressions' | 'avg_position'
  baseline      NUMERIC NOT NULL,              -- value at window_start
  goal_value    NUMERIC NOT NULL,              -- absolute objective
  window_start  TIMESTAMPTZ NOT NULL,
  window_end    TIMESTAMPTZ NOT NULL,          -- deadline (e.g. +60d)
  status        TEXT NOT NULL DEFAULT 'active',-- active|paused|hit|missed|archived
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE campaigns (
  id            BIGSERIAL PRIMARY KEY,
  target_id     BIGINT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  name          TEXT NOT NULL, priority INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'planned'
);
CREATE TABLE clusters (
  id            BIGSERIAL PRIMARY KEY,
  campaign_id   BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  intent        TEXT NOT NULL,                 -- informational|commercial|transactional|navigational
  opportunity   NUMERIC, coverage_pct NUMERIC DEFAULT 0
);
CREATE TABLE pages (
  id            BIGSERIAL PRIMARY KEY,
  cluster_id    BIGINT REFERENCES clusters(id) ON DELETE SET NULL,
  site_id       BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  article_id    BIGINT REFERENCES articles(id),
  url           TEXT, channel TEXT,            -- 'vercel' | 'wordpress' | 'shopify'
  index_status  TEXT DEFAULT 'unknown',        -- indexed|crawled|excluded|unknown
  rank_band     TEXT, decay_flag BOOLEAN DEFAULT false,
  last_verified_at TIMESTAMPTZ
);
CREATE INDEX ON pages (site_id, decay_flag) WHERE decay_flag;

-- ── Execution + durable state ──
CREATE TABLE runs (                            -- a planned batch of jobs toward a campaign
  id            BIGSERIAL PRIMARY KEY,
  campaign_id   BIGINT REFERENCES campaigns(id),
  site_id       BIGINT NOT NULL REFERENCES sites(id),
  status        TEXT NOT NULL DEFAULT 'pending',-- pending|running|blocked|succeeded|partially_failed|failed|canceled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE jobs (                            -- the atomic agent task; status = canonical state machine (§1.1)
  id            BIGSERIAL PRIMARY KEY,
  run_id        BIGINT REFERENCES runs(id) ON DELETE CASCADE,
  page_id       BIGINT REFERENCES pages(id),
  agent_key     TEXT NOT NULL,                 -- research|recon|simulate|draft|optimize|publish|verify|reoptimize
  status        TEXT NOT NULL DEFAULT 'queued',
  payload       JSONB NOT NULL,
  result        JSONB,
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 5,
  available_at  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- back-off / delayed scheduling
  idempotency_key TEXT UNIQUE,                 -- dedup at enqueue (no double work for the same request)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
CREATE INDEX ON jobs (status, agent_key, available_at);

CREATE TABLE job_events (                      -- append-only audit of every transition (powers the timeline UI)
  id BIGSERIAL PRIMARY KEY, job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_state TEXT, to_state TEXT NOT NULL, reason TEXT, actor TEXT,  -- 'system' | 'agent:<key>' | 'user:<id>'
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_checkpoints (                -- the step-ledger that makes a job resumable mid-flight
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,                     -- e.g. 'draft.written','publish.vercel.commit','publish.shopify.media'
  step_status TEXT NOT NULL,                   -- started|done|failed
  output JSONB,                                -- the durable result of this step (rehydrated on resume)
  UNIQUE (job_id, step_name)
);

CREATE TABLE idempotency_keys (                -- guards every external/side-effecting call
  key TEXT PRIMARY KEY,                        -- hash(job_id ‖ step_name ‖ target ‖ content_hash)
  scope TEXT NOT NULL,                         -- 'publish:vercel' | 'publish:shopify' | 'gsc:submit' ...
  response JSONB,                              -- cached provider response (returned on replay)
  status TEXT NOT NULL DEFAULT 'in_flight',    -- in_flight|succeeded|failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE publish_attempts (                -- per-target deploy ledger (one job may fan out to 3 channels)
  id BIGSERIAL PRIMARY KEY, job_id BIGINT NOT NULL REFERENCES jobs(id),
  channel TEXT NOT NULL, idempotency_key TEXT REFERENCES idempotency_keys(key),
  status TEXT NOT NULL,                         -- pending|committed|revalidated|live|failed
  external_ref TEXT, live_url TEXT, error TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Intelligence + telemetry ──
CREATE TABLE competitor_snapshots (
  id BIGSERIAL PRIMARY KEY, keyword TEXT NOT NULL, competitor_url TEXT NOT NULL,
  serp_position INT, semantic_profile JSONB,    -- entities, heading graph, schema types, link graph
  info_gain NUMERIC, captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON competitor_snapshots (keyword, captured_at DESC);

CREATE TABLE content_bundles (                  -- platform-agnostic publish payload (the §5 ContentBundle)
  id BIGSERIAL PRIMARY KEY, page_id BIGINT REFERENCES pages(id),
  content_hash TEXT NOT NULL,                   -- drives idempotency: same hash ⇒ skip republish
  body_md TEXT, meta JSONB,                     -- title, description, og, alt[], schema_jsonld
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE metrics_timeseries (               -- GA4 + GSC ingest; the feedback control signal
  page_id BIGINT NOT NULL REFERENCES pages(id),
  day DATE NOT NULL, source TEXT NOT NULL,       -- 'ga4' | 'gsc'
  impressions INT, clicks INT, ctr NUMERIC, avg_position NUMERIC, engagement NUMERIC,
  PRIMARY KEY (page_id, day, source)
);
```

### 4.2 BullMQ queue topology

| Queue | Job types | Concurrency | Retry / back-off | Dedup (`jobId`) | DLQ |
|---|---|---|---|---|---|
| `q:research` | trend pull, GSC/GA4 fetch | 8 | 5×, exp 5s→5m, ±jitter | `research:{page}:{day}` | `dlq:research` |
| `q:recon` | SERP scrape, teardown | 4 (proxy-bound) | 5×, exp + circuit-breaker | `recon:{keyword}:{day}` | `dlq:recon` |
| `q:simulate` | rank/impact forecast | 6 | 3× | `sim:{page}:{hash}` | `dlq:simulate` |
| `q:draft` | Gemini draft | 6 | 3×, token-budget aware | `draft:{page}:{brief}` | `dlq:draft` |
| `q:optimize` | on-page / links / schema | 6 | 3× | `opt:{page}:{rev}` | `dlq:optimize` |
| `q:publish` | multi-CMS deploy | 4 | 5×, idempotent replay | `pub:{page}:{content_hash}` | `dlq:publish` |
| `q:verify` | live-fetch, index check | 8 | 5×, long back-off | `vfy:{page}:{attempt}` | `dlq:verify` |

**Rules.** `jobId` = the dedup key above → a duplicate enqueue is a no-op (idempotent admission). `attempts < max_attempts` ⇒ re-queue with exponential back-off + jitter; on exhaustion the job moves to its DLQ and the DB job row flips to `quarantined` (surfaces in the Approvals tray for a human). A `removeOnComplete`/`removeOnFail: {age}` policy keeps Redis bounded; the durable record lives in Postgres regardless.

### 4.3 Idempotency + state-hydration (crash-safe resume)

A worker executes a job as an ordered list of **named steps**. Around each step:

1. **Before:** upsert `task_checkpoints(job_id, step_name, 'started')`. For any external write, `INSERT … ON CONFLICT DO NOTHING` into `idempotency_keys` with `key = hash(job_id ‖ step_name ‖ target ‖ content_hash)`.
2. **If the key already exists `succeeded`** → skip the call, return the cached `response` (no duplicate page, no burned token/API quota).
3. **Execute** the side effect; on success write `idempotency_keys.status='succeeded'`+`response`, then `task_checkpoints … 'done'` with the step output.
4. **On crash/restart**, the job is re-claimed and the worker **rehydrates** by reading `task_checkpoints` for that `job_id`: every `done` step is skipped and its `output` reloaded; execution resumes at the first non-`done` step. A Vercel commit that landed but whose Shopify push died resumes at exactly the Shopify step — Vercel is never re-committed.
5. **Compensation:** steps that are not naturally idempotent (rare) register a compensating action keyed the same way, run only if the forward step is rolled back.

### 4.4 Persisted task state machine

`jobs.status` is the canonical state (taxonomy + transition table in §2 / IA). Transitions are applied in a single transaction that (a) `UPDATE jobs SET status=…`, (b) `INSERT job_events(from,to,reason,actor)`, and (c) enqueues/acks the BullMQ job — so the DB state, the audit trail, and the queue can never diverge. A claim uses `SELECT … FOR UPDATE SKIP LOCKED` on `jobs WHERE status='queued' AND available_at<=now()`, guaranteeing exactly-one-worker-per-job even under horizontal scale.

---

I have the grounding I need: the job queue pattern (`claimNextJob` via `FOR UPDATE SKIP LOCKED`, idempotent `completeJob`/`failJob` with the A-04 `status='claimed'` guard, F-025 `2^attempts*5s` backoff), the `persistArticle` shape, and the worker `HANDLERS` registry. This aligns with everything the three drafts reference. I have enough to write the deliverable directly.

## 5. SEO Logic Implementation Guide

This guide specifies the end-to-end autonomous SEO loop as language-agnostic pseudo-code with explicit function signatures, data structures, thresholds, and failure modes. It is grounded in the three upstream pillars (Data Engine, Reverse-Engineering, Publishing) and the existing platform contracts: every long-running step runs in the **Python Playwright/LLM worker pool**, is dispatched through `jobs` via `claimNextJob` (`UPDATE … FOR UPDATE SKIP LOCKED`), and is finalized through the idempotent `completeJob`/`failJob` path (A-04 `status='claimed'` guard, F-025 `2^attempts·5s` backoff). Nothing here introduces new queue infrastructure; new work is new `agentKey` handlers and new typed tables.

The loop is seven deterministic, cacheable, individually retryable stages:

```
ingestAndScoreTrends ─► scrapeAndParseSerp ─► deconstructToSemanticProfile
        │                                              │
        ▼                                              ▼
  task_candidate (OS)                      SERP corpus + aggregates
        │                                              │
        └──────────────► computeInformationGain + coverageGaps
                                       │
                                       ▼
                synthesizeSuperiorOutlineAndDraft (entity/meta/OG/alt)
                                       │
                                       ▼
                buildContentBundle ─► deployIdempotent(target)
                                       │
                                       ▼
                checkRankAndMaybeReoptimize (GSC-driven feedback)
```

---

### 5.0 Core data structures

These two structures are the spine of the loop. `SemanticProfile` is the per-document feature vector produced by reverse-engineering; `ContentBundle` is the CMS-agnostic publish artifact. Both are immutable once stamped (`SemanticProfile` per `fetched_at`, `ContentBundle` per `revision`).

```
STRUCT SemanticProfile:
    # identity
    doc_id            : string            # sha256(normalized_dom)  — content-addressed, dedupe key
    url               : string
    rank              : int | null        # SERP position 1..N when from a competitor pull
    fetched_at        : timestamp
    geo, lang         : string

    # 1.1 heading / topic graph
    heading_tree      : list<HeadingNode> # ordered (h1..h4) tree
    section_depth     : float             # Σ tokens(section)/heading_count  — thoroughness proxy

    # 1.2 entities (canonicalized, KB-linked)
    entities          : list<Entity>      # {surface_forms, kgmid|qid, type, freq, salience, density}

    # 1.3 structured data
    schema_types      : set<string>       # {"Article","FAQPage","HowTo","Product",...}
    schema_complete   : map<string,bool>  # required-prop completeness per @type

    # 1.4 link graph
    internal_links    : int
    external_links    : int
    citation_density  : float             # external_authoritative_links / 1k words (E-E-A-T proxy)

    # 1.5 readability & surface
    word_count        : int
    flesch            : float
    fk_grade          : float
    passive_ratio     : float
    media             : map<string,int>   # {img,video,table,code,list}
    formats           : set<string>       # {comparison_table, tl;dr, step_list, data_chart}
    alt_coverage      : float             # imgs_with_alt / imgs

    # 1.6 passage embeddings (L2-normalized; cosine = dot product)
    passages          : list<Passage>     # {text, vec[D]}  256–512 tok, 20% overlap
    centroid          : vec[D]            # mean-pooled doc vector

STRUCT HeadingNode: { level:int, text:string, char_count:int, vec:vec[D], children:list<HeadingNode> }
STRUCT Entity:      { surface_forms:list<string>, kgmid:string|null, type:string,
                      freq:int, salience:float, density:float }   # density = freq/total_tokens
STRUCT Passage:     { text:string, vec:vec[D] }
```

```
STRUCT ContentBundle:                     # the contract between Drafting Engine and Publisher
    # identity & idempotency
    article_id        : int
    site_id           : int
    revision          : int               # bumps on any post-publish edit → drives update-vs-create
    idempotency_key   : string            # sha256(article_id + revision + target_id)
    content_hash      : string            # sha256(canonical body+meta) → skip-publish if unchanged

    # canonical content (source of truth = Markdown)
    title, slug       : string
    body_markdown     : string            # = articles.body
    body_html         : string            # derived, sanitized allow-list
    excerpt           : string            # = meta_description

    # SEO surface
    seo               : SeoSurface        # {meta_title, meta_description, canonical_url?,
                                          #  og{title,description,type,image?},
                                          #  twitter{card,title,description}, robots}

    # structured data (array of JSON-LD objects, Stage D output)
    schema            : list<json>

    # media to sideload (publisher uploads to each target's own library)
    assets            : list<AssetRef>    # {role, source_url, alt(non-empty), mime, checksum, w?, h?}

    # taxonomy hints (adapters map to native concepts)
    taxonomy          : Taxonomy          # {categories, tags, blog_handle?, collection_handles?, parent_page_id?}

    # publish governance
    status            : "draft" | "publish"
    author_ref        : AuthorRef | null
    publish_at        : iso8601 | null    # future-dated → scheduled

STRUCT AssetRef:  { role:"hero"|"inline"|"og", source_url:string, alt:string,   # alt REQUIRED, non-empty
                    mime:string, checksum:string, width:int?, height:int? }     # checksum = sha256(bytes) → library dedupe
```

---

### 5.1 `ingestAndScoreTrends()` — perishable signals → prioritized task candidates

Reconciles the 2026 source reality (no stable public Trends API — alpha-gated or Playwright scrape of `trends.google.com/trends/api/*`; Google Ads API **v24** `KeywordPlanIdeaService.GenerateKeywordIdeas`), normalizes relative Trends indices into pseudo-absolute volume via a co-requested anchor keyword, computes velocity/acceleration, cross-references commercial intent, and emits scored `task_candidate` rows under a strict admission rule.

```
FUNCTION ingestAndScoreTrends(tracked_entities: list<Entity>, cfg: CycleConfig) -> list<TaskCandidate>:
    candidates = []

    FOR entity IN tracked_entities:
        # ---- 1. Trends series (relative 0–100), co-request a stable anchor ----
        # Both terms normalized against the same max in one request → anchor reconstructs volume.
        series_raw = fetchTrendsSeries(entity, anchor=cfg.anchor_kw, window="90d",
                                       via = trendsAlphaIfAllowlisted() ?? PLAYWRIGHT_POOL)
        IF series_raw == NULL:                          # source loss → degrade, never emit garbage
            series = deriveFromKeywordPlannerMoM(entity)    # monthlySearchVolumes[] MoM deltas
            base_conf = 0.55
        ELSE:
            I        = series_raw.entity_index            # I[t] ∈ [0,100]
            I_anchor = series_raw.anchor_index
            anchorVol= keywordPlannerVolume(cfg.anchor_kw) # absolute, from Ads API
            V̂        = [ I[t] * (anchorVol / max(I_anchor[t], ε)) for t ]   # pseudo-absolute volume
            base_conf= 0.95 IF series_raw.from_alpha_api ELSE 0.70          # scraped Trends prior

        # ---- 2. 7-day EMA smoothing (suppress weekday seasonality) ----
        S = ema(V̂, alpha = 2/(7+1))                     # α = 0.25
        w = 7  ;  ε = 1.0

        velocity = (S[t] - S[t-w]) / (S[t-w] + ε)
        accel    = ((S[t]-S[t-w]) - (S[t-w]-S[t-2w])) / (S[t-2w] + ε)
        z        = (V̂[t] - mean(V̂[-90:])) / std(V̂[-90:])

        # ---- 3. Gating: acceleration > 0 is the NON-NEGOTIABLE breakout gate ----
        is_rising   = (velocity >= 0.20 AND accel > 0)
        is_breakout = (z >= 2.5)                          # bypasses velocity floor (zero-history virals)
        IF NOT (is_rising OR is_breakout): CONTINUE

        # ---- 4. Commercial-intent cross-reference (Ads API v24) ----
        km = generateKeywordIdeas(entity.surface_form)   # GenerateKeywordIdeas / HistoricalMetrics
        cpc = (km.lowTopOfPageBidMicros + km.highTopOfPageBidMicros)/2 / 1e6
        comp_index = (km.competitionIndex ?? MAP_COMP[km.competition]*100) / 100   # prefer index/100
        CI = 0.55*sigmoid((ln(cpc+1)-ln(cfg.cpc_med+1))/cfg.cpc_iqr)              # log-compress CPC
           + 0.30*clamp(km.avgMonthlySearches/cfg.volume_ref, 0, 1)              # bucket midpoint
           + 0.15*intentClassWeight(classifyIntent(entity.surface_form))         # txn1.0/comm0.8/info0.4/nav0.1

        # ---- 5. Difficulty: produced from live SERP (§5.2); backstop if stale ----
        KD = serpDifficulty(entity)  ??  100*(comp_index*0.6 + norm(log10(km.avgMonthlySearches+1))*0.4)

        # ---- 6. Assemble signals with source-specific freshness decay ----
        signals = [
            Signal("trends",  metric="momentum", value=combine(velocity,accel,z),
                   base_conf=base_conf, half_life_h = (12 IF is_breakout ELSE 72)),
            Signal("ads_kp",  metric="volume",   value=km.avgMonthlySearches,
                   base_conf=0.95, half_life_h=720),
            Signal("serp",    metric="kd",       value=KD, base_conf=0.90, half_life_h=168),
        ]
        FOR s IN signals:
            s.decayed_weight = s.base_conf * 0.5 ^ (ageHours(s.observed_at) / s.half_life_h)
        signals = [s for s in signals if s.decayed_weight >= 0.05]   # else retained-for-history only

        # ---- 7. Opportunity Score (0–100), freshness-weighted ----
        os = opportunityScore(entity, km, velocity, accel, z, CI, KD, signals, cfg)
        task_type = chooseTaskType(entity, KD, gsc_position=lookupGscPosition(entity))
        os_final  = os * IMPACT_MULT[task_type]          # content_optimize@#4–15 ×1.3, create ×1.0, schema ×0.9

        candidates.append(TaskCandidate(
            entity_id   = entity.id,
            dedup_key   = (entity.id, task_type),         # UNIQUE — same intent can't queue twice
            task_type   = task_type,
            os_final    = os_final,
            components  = {...},                          # for nightly weight recalibration
            provenance  = [(s.source, s.observed_at, s.decayed_weight) for s in signals],
            conf_sum    = Σ s.decayed_weight,
        ))

    RETURN admitCandidates(candidates, cfg)


FUNCTION opportunityScore(entity, km, velocity, accel, z, CI, KD, signals, cfg) -> float:
    Demand        = clamp(log10(km.avgMonthlySearches+1)/log10(cfg.volume_ref+1), 0, 1)   # w=0.22
    Momentum      = clamp(0.6*norm(velocity) + 0.4*norm(accel), 0, 1)                     # w=0.20
    CommercialInt = CI                                                                     # w=0.18
    Achievability = 1 - KD/100                                                             # w=0.18
    GapMagnitude  = max(entityGapScore(entity), schemaGapFlag(entity))                     # w=0.12
    StrategicFit  = cosine(entity.embedding, cfg.site_topic_centroid)                      # w=0.10

    # HARD VETO: fading fad (no accel, no breakout) cannot create/expand content.
    IF accel <= 0 AND z < 2.5:
        Momentum = 0
        IF entity.proposed_task_type IN {content_create, cluster_expand}: RETURN 0

    W = {Demand:0.22, Momentum:0.20, CommercialInt:0.18, Achievability:0.18, GapMagnitude:0.12, StrategicFit:0.10}
    num = Σ_i W[i]*component_i*decayed_weight_i      # freshness-weighted numerator
    den = Σ_i W[i]*decayed_weight_i
    RETURN 100 * num/den
```

**Admission rule** (all five must hold; this is the anti-noise core):

```
FUNCTION admitCandidates(cands: list<TaskCandidate>, cfg) -> list<TaskCandidate>:
    admitted = []
    bucket   = RedisTokenBucket(rate = cfg.max_tasks_per_cycle)     # self-paces vs quotas/CMS limits
    FOR c IN sortByPriorityDesc(cands):                            # priority = os_final
        c.priority += 5 * weeksHeld(c)                             # starvation protection (+5/week aging)

        IF c.os_final < cfg.admission_floor:        CONTINUE        # (1) threshold (default 60, learned)
        IF existsActive(c.dedup_key, states={queued,in_progress,"published<90d"}):
            upsertScore(c.dedup_key, c.os_final)                   # (2) re-obs UPDATES, never duplicates
            CONTINUE                                               #     ON CONFLICT DO UPDATE GREATEST(os)
        IF c.conf_sum < cfg.tau_conf (=0.5):
            holdFor(c, "pending_corroboration")     ; CONTINUE     # (4) needs 2nd independent source
        IF NOT bucket.tryAcquire():                 BREAK          # (3) capacity/budget — rate-limited

        # (5) human-in-the-loop gate
        c.approval_required = (c.os_final >= 85)
                           OR (estimatedCost(c) > cfg.budget_alert)
                           OR (c.task_type IN cfg.high_risk_set)
        admitted.append(c)
        enqueueJob(agentKey = mapTaskTypeToAgent(c.task_type),     # → jobs table (existing path)
                   payload  = bullmqPayload(c))
    RETURN admitted
```

**Failure modes**: Trends loss → Keyword Planner MoM fallback, `base_conf` drops, corroboration bar rises (engine slows, never emits garbage). Quota exhaustion → token buckets defer lowest-OS fetches; `signal_raw` Redis cache (TTL = half_life/4) serves stale-but-flagged data. Parse failure → `signal_quality_error`, never a silent zero (which would poison TF-IDF baselines).

---

### 5.2 `scrapeAndParseSerp(keyword)` — Playwright pool with anti-bot handling

Runs entirely in the Playwright worker pool. Honors robots.txt + crawl-delay, per-domain Redis token bucket (1 req / 3s / domain default), rotating residential egress, locale/geo pinned to the GSC/GA4 property, JS-rendered to capture PAA and SERP features. Every fetch is content-hashed so unchanged pages cost nothing downstream.

```
FUNCTION scrapeAndParseSerp(keyword: string, geo: string, lang: string, N: int = 10) -> SerpSnapshot:
    # ---- 1. Fetch the live SERP page (rendered) ----
    serp_html = playwrightFetch(
        url      = googleSearchUrl(keyword, geo, lang),
        egress   = rotateResidentialProxy(geo),
        render   = JS_FULL,                      # capture PAA + dynamic features
        retry    = ExpBackoff(on={429,503}, base="3s", max_attempts=5))
    IF serp_html.blocked (CAPTCHA/403):
        serp_html = retryWith(freshProxy + slowerCadence)
        IF still_blocked: corpus_confidence_penalty = TRUE     # lower w_conf downstream

    organic   = extractTopOrganic(serp_html, N)               # [{rank,url,domain,title,meta_description}]
    features  = extractSerpFeatures(serp_html)                # featured_snippet owner, PAA[], image/video pack, ads_count, knowledge_panel
    paa       = features.paa_questions
    related   = extractRelatedSearches(serp_html)

    # ---- 2. Fetch + render each competitor; content-hash gate ----
    docs = []
    FOR r IN organic:
        IF NOT robotsAllows(r.url):  CONTINUE                  # honor robots.txt + crawl-delay
        domainBucket(r.domain).acquire()                      # Redis token bucket, 1 req / 3s / domain
        page = playwrightFetch(r.url, egress=rotateResidentialProxy(geo),
                               render=JS_FULL, retry=ExpBackoff(on={429,503}, base="3s"))
        IF page.failed:  CONTINUE                              # exclude; lowers corpus confidence

        dom_hash = sha256(normalizeDom(page.dom))
        IF dom_hash == cache.get(r.url).dom_hash:
            docs.append(cache.get(r.url).profile)             # unchanged → reuse, zero parse cost
            CONTINUE

        # ---- 3. Boilerplate strip → main article node ----
        main = readabilityExtract(page.dom)                   # Trafilatura/Readability-lxml; drop nav/footer/sidebars/cookie/comments
        profile = deconstructToSemanticProfile(main, url=r.url, rank=r.rank,
                                               geo=geo, lang=lang, dom_hash=dom_hash)
        cache.put(r.url, {dom_hash, profile})
        persistCompetitorSignal(r.url, profile, dom_hash, observed_at=now())   # competitor_signal table
        docs.append(profile)

    # ---- 4. Hard failure: insufficient corpus ----
    IF len(docs) < 3:
        FLAG("INSUFFICIENT_CORPUS", keyword); ABORT_CYCLE(keyword)

    # ---- 5. SERP aggregates (built once over corpus C) ----
    aggregates = buildSerpAggregates(docs, keyword, paa, related)
    snapshot   = SerpSnapshot(keyword, geo, lang, organic, features, docs, aggregates,
                              w_conf = len(docs)/N, fetched_at=now())
    persist(snapshot)                                          # serp_snapshot_id referenced by BullMQ payload
    RETURN snapshot


FUNCTION buildSerpAggregates(docs, q, paa, related) -> SerpAggregates:
    μ_C   = mean([d.centroid for d in docs])                  # consensus centroid (topical center of mass)
    # entity frequency table: df(e) = #docs containing e ; mean salience s̄(e)
    EF    = { e: {df: countDocs(e,docs)/len(docs), s_bar: meanSalience(e,docs)} for e in union(d.entities) }
    E_core= { e for e,v in EF if v.df >= 0.5 }                # table-stakes entities (≥50% of ranking pages)

    # heading-cluster map → subtopics (HDBSCAN over pooled heading vecs, cosine, min_cluster_size=2)
    clusters = hdbscan([h.vec for d in docs for h in flatten(d.heading_tree)], metric="cosine", min_size=2)
    subtopics = [ Subtopic(label=medoidHeading(k), vec=medoid(k),
                           coverage=coveringDocs(k)/len(docs), mean_rank=meanRank(k)) for k in clusters ]

    passage_index = VectorStore([(p.vec, p.text, d.url) for d in docs for p in d.passages])  # FAISS/pgvector
    RETURN SerpAggregates(μ_C, EF, E_core, subtopics, passage_index, paa, related)
```

---

### 5.3 `deconstructToSemanticProfile(article)` — reverse-engineer one winning document

Pure, deterministic feature extraction over a boilerplate-stripped article node. No LLM in the hot path (NER + embeddings + parsers only) so it is cheap and reproducible.

```
FUNCTION deconstructToSemanticProfile(main, url, rank, geo, lang, dom_hash) -> SemanticProfile:
    # 1.1 heading / topic graph
    heading_tree = parseHeadingTree(main, levels=[h1,h2,h3,h4])
    FOR h IN walk(heading_tree): h.vec = embed(h.text)        # sentence-transformer, L2-normalized
    section_depth = sum(tokens(sectionOf(h)) for h) / max(headingCount, 1)

    # 1.2 entity extraction + KB linking (canonicalize synonyms: "NYC" ≡ "New York City" ≡ kgmid)
    raw_ents = ner(main.text)                                 # spaCy en_core_web_trf / GLiNER (open-schema)
    entities = []
    FOR ent IN collapseByKb(raw_ents, resolver=knowledgeGraphLink):   # → kgmid/QID
        density  = ent.freq / main.total_tokens
        salience = ent.tf * log(1 + headingProximity(ent)) * positionWeight(ent)
        entities.append(Entity(ent.surface_forms, ent.kgmid, ent.type, ent.freq, salience, density))

    # 1.3 structured data — parse all three syntaxes
    sd          = parseStructuredData(main.raw_html)          # JSON-LD (primary) + Microdata + RDFa
    schema_types= resolveTypes(sd)                            # against schema.org vocab
    schema_complete = { t: requiredPropsPresent(t, sd) for t in schema_types }  # e.g. Product→offers.price

    # 1.4 link graph
    il = countInternalLinks(main) ; xl = countExternalLinks(main)
    citation_density = authoritativeExternal(main) / (word_count/1000)   # E-E-A-T proxy

    # 1.5 readability & surface
    wc    = wordCount(main)
    fmt   = detectFormats(main)                              # {comparison_table, tl;dr, step_list, data_chart}
    media = countMedia(main)                                 # {img,video,table,code,list}
    alt_cov = imgsWithAlt(main)/max(media.img,1)

    # 1.6 passages (256–512 tok, 20% overlap) + doc centroid
    passages = [ Passage(text=c, vec=embed(c)) for c in chunk(main.text, 256..512, overlap=0.20) ]
    centroid = l2normalize(mean([p.vec for p in passages]))

    RETURN SemanticProfile(doc_id=dom_hash, url, rank, fetched_at=now(), geo, lang,
                           heading_tree, section_depth, entities, schema_types, schema_complete,
                           il, xl, citation_density, wc, flesch(main), fkGrade(main),
                           passiveRatio(main), media, fmt, alt_cov, passages, centroid)
```

---

### 5.4 `computeInformationGain(profile, serpCorpus)` + `coverageGaps()`

Quantifies how much **novel, query-relevant** information a passage/draft adds vs the SERP corpus (novelty without relevance is noise — both required), and derives the entity/subtopic gaps that drive outline construction. All embeddings L2-normalized; cosine = dot product.

```
# ---- Passage-level information gain ----
FUNCTION informationGain(p: Passage, q_vec: vec[D], corpus: SerpAggregates) -> IGResult:
    rel = cosine(p.vec, q_vec)                                       # relevance to query
    red = max( cosine(p.vec, p2.vec) for p2 in corpus.passage_index.knn(p.vec, k=1) )  # top-1 redundancy
    nov = 1 - red
    ig  = rel * nov                                                  # high only when relevant AND unseen
    qualifies = (rel >= 0.30 AND nov >= 0.25 AND ig > 0.075)         # red ≤ 0.75
    RETURN IGResult(rel, nov, ig, qualifies)


# ---- Document-level IGI: must beat SERP median by a margin ----
FUNCTION computeInformationGain(D: SemanticProfile, corpus: SerpAggregates, q_vec) -> IGIResult:
    gainpos = [ informationGain(p, q_vec, corpus) for p in D.passages if informationGain(...).qualifies ]

    E_D            = canonicalSet(D.entities)
    entity_recall  = |E_D ∩ corpus.E_core| / |corpus.E_core|                       # table-stakes coverage
    Δ_E            = { e in E_D \ corpus.allEntities if cosine(embed(e), q_vec) >= 0.35 }  # relevant differentiators
    diff_density   = |Δ_E| / (D.word_count/1000)
    covered        = [ k for k in corpus.subtopics if k.coverage > 0 AND touchedBy(D,k) ]
    relevant_k     = [ k for k in corpus.subtopics if cosine(k.vec, q_vec) >= 0.45 ]
    subtopic_cov   = |covered| / max(|relevant_k|, 1)

    w = [0.40, 0.25, 0.15, 0.20]
    IGI = 100 * ( w[0]*mean([g.ig for g in gainpos])
                + w[1]*entity_recall
                + w[2]*diff_density
                + w[3]*subtopic_cov )

    gate = max(60, median([igiOf(d) for d in corpus.docs]) + 10)    # publish gate: beat SERP median +10
    RETURN IGIResult(IGI, gate, entity_recall, Δ_E, gainpos, subtopic_cov, passes = IGI >= gate)


# ---- Coverage gaps → the actionable build inputs ----
FUNCTION coverageGaps(D_or_null: SemanticProfile|null, corpus: SerpAggregates, q_vec) -> GapReport:
    E_D = D_or_null ? canonicalSet(D_or_null.entities) : {}
    missing_entities = corpus.E_core \ E_D                          # MANDATORY inclusions (table stakes)
    differentiators  = { e in E_D \ corpus.allEntities if cosine(embed(e),q_vec) >= 0.35 }  # entity-level gain

    # subtopic gaps from the heading-cluster map
    underserved = [ k for k in corpus.subtopics
                    if k.coverage <= 0.4 AND cosine(k.vec,q_vec) >= 0.45 ]   # partial gaps, high leverage
    # whitespace: query-relevant clusters from PAA + related that NO competitor covers
    whitespace  = []
    FOR question IN (corpus.paa + corpus.related):
        v = embed(question)
        IF min(cosine(v, k.vec) for k in corpus.subtopics) > 0.60:          # nN-distance > 0.6 from every medoid
            whitespace.append(Subtopic(label=question, vec=v, coverage=0.0))

    # schema gap: @types on ≥40% of competitors but absent on our page → high-precision task
    comp_types  = typeFrequency(corpus.docs)
    schema_gap  = { t for t,freq in comp_types if freq >= 0.40 AND (D_or_null==null OR t not in D_or_null.schema_types) }

    RETURN GapReport(missing_entities, differentiators, underserved, whitespace, schema_gap)
```

---

### 5.5 `synthesizeSuperiorOutlineAndDraft(...)` — outline → draft with entity + meta/OG/alt injection

Consumes the SERP corpus, gaps, and classified intent; produces a build-ready outline whose projected `IGI ≥ gate`, then drafts section-by-section (keeps each LLM call inside the effective attention window, eliminates mid-article keyword drift, lets one failed section retry without a full rewrite). Each stage is a separate Gemini call with `responseSchema` enforced (`completeJson<T>` / `complete(thinking_level)`), so every output is validated JSON and individually retryable. **Metadata is derived programmatically, not by the LLM** — LLMs are unreliable at character counts.

```
FUNCTION synthesizeSuperiorOutlineAndDraft(brief: DraftBrief, corpus: SerpAggregates, q_vec) -> DraftResult:
    intent = classifyIntent(brief.primaryKeyword, corpus.organic_titles, corpus.features)
             # weighted vote 0.6·LLM(zero-shot) + 0.4·rules(lexical + SERP-shape); {primary,secondary,confidence}
    gaps   = coverageGaps(existingProfileForUrl(brief.target_url), corpus, q_vec)

    # ===== Stage A — outline synthesis =====
    # Merge competitor headings → frequency-weighted graph; cluster near-dups
    # (cosine ≥ 0.82, or trigram Jaccard ≥ 0.6 no-embedding fallback).
    sections = []
    # (A1) table-stakes skeleton: consensus clusters (coverage ≥ 0.6), ordered by INTENT blueprint not competitor order
    FOR k IN corpus.subtopics WHERE k.coverage >= 0.6:
        sections.append(OutlineSection(h2=k.label, source="consensus",
                                       target_entities=[], children=[], covers_gap=false))
    # (A2) gap-fill: under-served + whitespace, each with an explicit information_gain_target
    FOR k IN (gaps.underserved + gaps.whitespace):
        sections.append(OutlineSection(h2=k.label, source=(k.coverage<=0.4?"gap":"whitespace"),
                                       information_gain_target=expectedIG(k), covers_gap=true))
    # (A3) differentiator blocks: original research / Δ_E entities / expanded comparison axes — the supersession levers
    FOR e IN gaps.differentiators:
        bindToBestSection(sections, e) OR sections.append(OutlineSection(h2=diffHeading(e),
                                       source="differentiator", target_entities=[e], covers_gap=true))

    # CONTEXTUAL ENTITY INJECTION (bind at outline time, never sprinkle post-hoc):
    # every entity with salience ≥ 0.4 AND coverageInCompetitors ≥ 0.5 maps to EXACTLY ONE section.
    FOR e IN brief.entityGraph WHERE e.salience >= 0.4 AND e.coverageInCompetitors >= 0.5:
        assertMappedToExactlyOneSection(sections, e)          # Stage E will reject if any missing
    # secondary keywords: ≤1 per section, no stuffing
    assignSecondaryKeywords(sections, brief.secondaryKeywords, max_per_section=1)
    # format superiority: upgrade dominant competitor format where IG-positive (prose → comparison/spec table, +tl;dr)
    FOR s IN sections: s.suggested_format = upgradeFormat(dominantFormatFor(s, corpus))

    faq_block = [ {question:q, answer_hint:hint} for q in brief.paaQuestions ][:8]   # caps FAQPage at 8
    target_wc = clamp(round(median([d.word_count for d in corpus.docs]) * 1.15, 100), 600, 3500)
    outline   = ContentOutline(h1=questionFormIf(intent.primary=="informational", brief.primaryKeyword),
                               sections, faq_block, est_word_count=target_wc)

    # ===== Stage B — draft expansion, SECTION BY SECTION =====
    FOR s IN outline.sections:
        s.body = completeJson(prompt=sectionPrompt(s, intent, brief),
                              constrain={entities:s.target_entities, secondary_kw:s.secondary_keyword},
                              schema=SectionDraftSchema)               # retryable in isolation
    draft_md = assemble(outline)

    # density governor: primary-keyword density 0.8–1.5% target, HARD-FAIL > 2.5% (stuffing)
    kd = count(exactPhrase ∪ stemmedVariants, draft_md) / totalWords(draft_md)
    IF kd > 0.025: reflowSectionsToReduceDensity(outline); RECOMPUTE

    # ===== Stage C — on-page metadata (PROGRAMMATIC; hard length budgets, word-boundary truncation) =====
    meta = {}
    meta.title       = truncateAtWord(frontLoad(brief.primaryKeyword) + brandSuffix, 60)
    meta.description = truncateAtWord(activeVoice(extractiveSummary(introOf(draft_md))
                                      + oneSecondaryKeyword(brief)), 155)   # CTA verb
    slug             = dedupeSlug(slugify(outline.h1), brief.site_id, articles_slug)   # ≤60, append -2/-3
    og               = { title: meta.title (≤60), description: truncateAtWord(meta.description,200), type:"article" }
    twitter          = { card:"summary_large_image", title: meta.title, description: meta.description }
    # image alt: "<entityInSection> — <descriptivePhrase>", NEVER keyword-only, ≤125, non-empty
    FOR img IN imagesOf(draft_md):
        img.alt = truncateAtWord(entityFor(img, outline) + " — " + descriptivePhrase(img), 125)
    enforceHeadingHierarchy(draft_md)   # no skipped levels; primary keyword in ≥1 H2

    # ===== Stage D — structured data (JSON-LD), chosen by intent + SERP features =====
    schema = [ articleSchema(draft_md, brief) ]   # Article/BlogPosting + headline,datePublished,dateModified,author,image,mainEntityOfPage
    schema[0].about    = [ {"@type":e.type, "name":e.name, "sameAs":wikidataUrl(e.wikidataId)}
                           for e in brief.entityGraph if e.wikidataId ]      # entity-level schema injection → Knowledge Graph
    IF len(brief.paaQuestions) >= 3:        schema.append(faqPageSchema(faq_block))
    IF isProcedural(outline, min_steps=3):  schema.append(howToSchema(outline))
    schema.append(breadcrumbListSchema(siteTaxonomy(brief.site_id)))        # always
    schema = [ s for s in schema if validatesAgainstSchemaOrg(s) ]

    # ===== Stage E — self-audit gate (reuse qa + seo-optimization agents; max 2 reflows) =====
    audit = selfAudit(draft_md, meta, schema, outline, brief)
    IF NOT audit.ok AND audit.reflows < 2:
        # targeted regeneration of the LIMITING term only (not a full rewrite)
        IF audit.missing_entities:  reAddEntities(outline, audit.missing_entities)        # low entity_recall
        IF audit.low_novelty:       injectDifferentiators(outline, gaps.differentiators)  # inject more Δ_E
        IF audit.low_subtopic:      addClusters(outline, gaps.underserved)
        GOTO Stage B (deficient sections only)

    # anti-cannibalization: merge/redirect instead of publishing a near-duplicate of our own corpus
    centroid_D = l2normalize(mean([embed(c) for c in chunk(draft_md)]))
    IF max(cosine(centroid_D, c) for c in ourPublishedCentroids(brief.site_id)) >= 0.85:
        RETURN DraftResult(action="merge_or_redirect", target=nearestOwnUrl(centroid_D))

    igi = computeInformationGain(profileOf(draft_md), corpus, q_vec)
    RETURN DraftResult(action="draft_ready", title=outline.h1, slug, body_markdown=draft_md,
                       meta, og, twitter, schema, scorecard={IGI:igi.IGI, gate:igi.gate,
                       entity_recall:igi.entity_recall, differentiator_count:|igi.Δ_E|,
                       intent_match:intent, projected_vs_median: igi.IGI - igi.gate})
    # → emitted to the human-in-the-loop checkpoint WITH the scorecard before publish
```

---

### 5.6 `buildContentBundle(...)` and `deployIdempotent(bundle, target)`

`buildContentBundle` assembles the immutable, CMS-agnostic artifact from the `articles` row + schema/asset sidecars. `deployIdempotent` is the per-target adapter call; publishing is a `publish` job (`agentKey:"publish"`) claimed via the existing `claimNextJob` and finalized via `completeJob`/`failJob`. A `publish` job spanning N targets is **not atomic across targets** — each target is its own idempotent unit, so a 2-of-3 partial success is a valid, resumable state, never a rollback.

```
FUNCTION buildContentBundle(article_row, schema_sidecar, asset_sidecar, site_id, revision) -> ContentBundle:
    body_md   = article_row.body                                  # source of truth (articles.body)
    body_html = sanitize(renderMarkdown(body_md), ALLOW_LIST)     # derived cache (HTML-native targets)
    canonical = canonicalize(body_md, schema_sidecar, article_row) # deterministic byte form
    RETURN ContentBundle(
        article_id  = article_row.id,
        site_id     = site_id,
        revision    = revision,                                   # bumps on any post-publish edit
        content_hash= sha256(canonical),                         # noop-publish if unchanged
        idempotency_key = "",                                     # stamped per-target in deployIdempotent
        title=article_row.title, slug=article_row.slug,
        body_markdown=body_md, body_html=body_html,
        excerpt=article_row.metaDescription,
        seo = SeoSurface(meta_title=article_row.metaTitle, meta_description=article_row.metaDescription,
                         canonical_url=canonical_url?,
                         og={...}, twitter={card:"summary_large_image",...}, robots="index,follow"),
        schema = schema_sidecar.jsonld,                          # Stage D array
        assets = [ AssetRef(role, source_url, alt /*non-empty*/, mime, checksum=sha256(bytes), w?, h?)
                   for a in asset_sidecar ],
        taxonomy = Taxonomy(categories, tags, blog_handle?, collection_handles?, parent_page_id?),
        status   = article_row.requested_status,                 # "draft" | "publish"
        author_ref = author?, publish_at = article_row.publishAt?)


# ---- The publish job handler (registered exactly like the existing ones) ----
# worker.py:  HANDLERS["publish"] = handle_publish
FUNCTION handle_publish(payload) -> dict:                        # payload {articleId, revision, targets?:[]}
    site_id  = siteIdOf(payload.articleId)
    targets  = resolveEnabledTargets(site_id, filter=payload.targets)   # from site_integrations
    bundle   = buildContentBundle(loadArticle(payload.articleId), loadSchema(...), loadAssets(...),
                                  site_id, payload.revision)            # built ONCE, fanned out
    results  = []
    FOR t IN targets:                                            # NOT atomic across targets
        results.append( deployIdempotent(bundle, t, ctx=publishContext(site_id, t)) )

    # aggregate: any non-retryable failure → fail(retry=false) → human gate; any retryable → fail(retry=true)
    IF any(r.ack=="failed" AND NOT r.error.retryable for r in results):
        RAISE NonRetryable(summarize(results))                  # server maps → failJob(retry=false) → Telegram
    IF any(r.ack=="failed" AND r.error.retryable for r in results):
        RAISE Retryable(summarize(results), retry_after=maxRetryAfter(results))  # rides 2^attempts·5s backoff
    RETURN { targets: [r.serialize() for r in results] }        # union written to jobs.result → runs.result → articles row


# ---- Per-target idempotent deploy (receipt-based, the core durability guarantee) ----
FUNCTION deployIdempotent(bundle: ContentBundle, target: PublishTarget, ctx) -> PublishResult:
    bundle.idempotency_key = sha256(bundle.article_id + bundle.revision + target.id)
    t0 = now()

    pf = target.preflight(ctx)                                   # cheap cred/config check before any mutation
    IF NOT pf.ok: RETURN failed(target.id, code="AUTH"|"VALIDATION", retryable=false, msg=pf.reason)

    receipt = getReceipt(bundle.article_id, bundle.revision, target.id)   # publish_receipts (unique key)
    # (1) exact replay → true no-op, CMS untouched
    IF receipt AND receipt.content_hash == bundle.content_hash:
        RETURN PublishResult(target.id, ack="noop", ref=receipt.ref,
                             revision_published=bundle.revision, idempotency_key=bundle.idempotency_key,
                             duration_ms=elapsed(t0))

    # sideload assets first (ordering matters for WP featured_media); dedupe by checksum
    FOR a IN bundle.assets:
        uploaded = target.uploadAsset(a, ctx)                   # MUST dedupe on checksum → {remote_id, deduped}
        bindAsset(bundle, a, uploaded)

    TRY:
        # (2) receipt with remote_id but different hash (post-publish edit, higher revision) → UPDATE, never create
        IF receipt AND receipt.remote_id:
            res = target.publish(bundle, ctx)                   # adapter issues update against receipt.remote_id
        ELSE:
            # (3) no receipt → create, then persist receipt in the SAME logical step as recording remote_id
            res = target.publish(bundle, ctx)
        upsertReceipt(bundle.article_id, bundle.revision, target.id,
                      idempotency_key=bundle.idempotency_key, content_hash=bundle.content_hash,
                      remote_id=res.ref.remote_id, remote_url=res.ref.remote_url, ack=res.ack)
        RETURN res WITH duration_ms=elapsed(t0)
    CATCH e:
        RETURN classifyError(e, target.id, bundle.idempotency_key)
        # RATE_LIMIT/UPSTREAM_5XX/NETWORK → retryable:true (+retry_after_ms from Retry-After header)
        # AUTH/VALIDATION             → retryable:false
        # Vercel 409 on stale file sha → CONFLICT, retryable:true (re-read blob sha, retry)
```

**Adapter specifics** (all enforce idempotency via `publish_receipts.remote_id`, never by slug):

- **Vercel** (`nativeFormat:"json"/MDX`): no content API → commit via GitHub Contents API `PUT /repos/{owner}/{repo}/contents/{path}`; `GET` the existing blob `sha` first (absence ⇒ create, presence ⇒ update). Commit `sha` = `remote_id`; the file `sha` is the optimistic-concurrency token (replayed stale `sha` → 409 `CONFLICT`, retryable, so never double-commit). After the build webhook confirms, `POST /api/revalidate?path=/<slug>&secret=…` (`revalidatePath`); `revision_published` advances only on a 200. Scheduling: `false` (defer the job to `publish_at`).
- **WordPress** (`nativeFormat:"html"`): media sideload first — `POST /wp/v2/media` (multipart, set `alt_text` from `asset.alt`, dedupe by `?search=<checksum>`); hero `id` → `featured_media`. Then `POST /wp/v2/posts` (create) or `/wp/v2/posts/{id}` (update when receipt has `remote_id`); `status` map `draft→draft`, `publish→publish`, future `publish_at → status:"future" + date_gmt`. JSON-LD injected as `<script type="application/ld+json">` in `content.raw`. `promote()` = `{status:"publish"}` gated on the content-approval gate.
- **Shopify** (`nativeFormat:"html"`): surface chosen from `taxonomy` — blog article (`POST /blogs/{id}/articles.json`), collection/page (`PUT /pages/{id}.json`), or product `metafield` (`namespace:"seo"`). Template-schema matching: fetch the live object's shape (`GET /metafield_definitions.json`) and project the bundle onto only fields the theme renders, so Liquid never breaks. On `429`, honor `Retry-After` → `error.retry_after_ms`.

**Durability contract**: a `publish` job may be delivered or replayed any number of times and, for a fixed `(article_id, revision)`, converges every target to exactly one live object reflecting that revision — the exactly-once-effect guarantee the platform already provides for `research`/`content-writing` jobs, extended to external CMS side effects through receipt-based idempotency and the server-side A-04 transition guard.

---

### 5.7 `checkRankAndMaybeReoptimize(page)` — GSC-driven re-optimization trigger

Closes the loop. Pulls live performance from the **Search Analytics API** (`searchanalytics.query`, 2–3 day lag), detects decay or striking-distance opportunity, and conditionally re-enters the loop at §5.2 (fresh SERP) → §5.4 (gap recompute) → §5.5 (targeted reflow) → §5.6 (republish as a new `revision`). Realized GA4/GSC outcomes also feed the nightly recalibration of component weights, the `impact_mult` table, and the OS admission floor.

```
FUNCTION checkRankAndMaybeReoptimize(page: PublishedPage, cfg) -> ReoptDecision:
    # ---- 1. Pull GSC performance (current vs trailing baseline) ----
    cur  = gscQuery(page.url, range="last_28d",  dims=["query","page"])   # searchanalytics.query
    prev = gscQuery(page.url, range="prev_28d",  dims=["query","page"])
    pos_now   = cur.avg_position ; pos_prev = prev.avg_position
    ctr_now   = cur.ctr          ; clicks_now = cur.clicks
    impr_now  = cur.impressions
    expected_ctr = ctrCurveFor(pos_now)                      # position→CTR model (per-vertical calibrated)

    # ---- 2. Triggers (any fires) ----
    decayed          = (pos_now - pos_prev) >= 3                          # lost ≥3 positions WoW
    striking_distance= (4 <= pos_now <= 15)                              # page 1–2 edge → cheap, high-yield
    ctr_underperform = (impr_now >= cfg.min_impr AND ctr_now < 0.6*expected_ctr)  # SERP-snippet/title problem
    cannibalizing    = detectQueryOverlap(page, ourOtherPages(page.site_id)) >= 0.85
    new_competitor   = competitorPageDelta(page.target_query)            # rival expanded a page that now outranks us
                       # (word_count +25% OR new schema type OR new H2 entities), from competitor_signal cadence

    IF NOT (decayed OR striking_distance OR ctr_underperform OR cannibalizing OR new_competitor):
        RETURN ReoptDecision(action="hold", reason="stable", next_check=cfg.cadence)

    # ---- 3. Cheap fixes bypass a full reflow ----
    IF ctr_underperform AND NOT (decayed OR new_competitor):
        # snippet-only: regenerate metaTitle/metaDescription (Stage C), bump revision, republish — no body rewrite
        bumpRevisionMetaOnly(page); enqueueJob("publish", {articleId:page.article_id, revision:page.revision+1})
        RETURN ReoptDecision(action="meta_refresh", trigger="ctr")
    IF cannibalizing:
        RETURN ReoptDecision(action="merge_or_redirect", target=strongerOf(page, overlapping))

    # ---- 4. Full re-optimization: re-enter the loop with a content_optimize candidate ----
    snapshot = scrapeAndParseSerp(page.target_query, page.geo, page.lang)      # §5.2 fresh corpus
    gaps     = coverageGaps(profileOf(page), snapshot.aggregates, embed(page.target_query))  # §5.4
    # striking-distance gets the 1.3 impact multiplier → high admission priority
    cand     = TaskCandidate(entity_id=page.entity_id, dedup_key=(page.entity_id,"content_optimize"),
                             task_type="content_optimize",
                             os_final = opportunityScore(...) * (1.3 IF striking_distance ELSE 1.0))
    IF admitOne(cand, cfg):                                  # same 5-rule admission (no-collision: re-obs bumps priority)
        enqueueJob("content-writing", {ideaId:page.idea_id, target_url:page.url,
                                       reoptimize:true, gaps:gaps, serp_snapshot_id:snapshot.id})
        RETURN ReoptDecision(action="reoptimize", trigger=firstFiring([decayed,striking_distance,new_competitor]),
                             gaps=gaps)
    RETURN ReoptDecision(action="hold", reason="below_floor_or_rate_limited")


# ---- Nightly self-correction: measured lift recalibrates the scoring, not predicted opportunity ----
FUNCTION recalibrateFromOutcomes(cfg):                      # cron, feeds §5.1
    labels = joinShippedTasksToOutcomes(window="60d",       # task_candidate ⋈ GA4 sessions + GSC clicks/position delta
                                        metrics=["position_delta","clicks_delta","sessions_delta"])
    cfg.component_weights = ridgeRefit(labels, predictors=OS_components)   # w_i ← measured ROI
    cfg.impact_mult       = recalibrateMultipliers(labels, by="task_type")
    cfg.admission_floor   = raiseIf(realizedRoiOfRecent(labels) < cfg.roi_target)   # floor auto-raises on underperformance
    persist(cfg)
```

---

### 5.8 Cross-cutting guarantees

| Concern | Mechanism | Grounded in |
|---|---|---|
| Exactly-once side effects | A-04 idempotent `completeJob`/`failJob` (`status='claimed'` guard) + `publish_receipts(article_id,revision,target_id)` | `jobs.ts`, Publishing draft §2.3 |
| Transient-failure resilience | F-025 worker backoff `2^attempts·5s` (cap 300s); `error.retryable` routing | `worker.py`, Publishing §2.3 |
| Anti-noise admission | confidence floor `Σ decayed_weight ≥ 0.5` → `pending_corroboration` until a 2nd independent source | Data Engine §2.3.4 |
| On-domain focus | `StrategicFit = cosine(entity_emb, site_topic_centroid)` veto; anti-cannibalization `cos ≥ 0.85` | Data Engine §2.3.3, RE §5.3 |
| Source degradation | Trends loss → Keyword Planner MoM fallback, `base_conf` drop raises corroboration bar | Data Engine §2.3.5 |
| Quality before publish | IGI publish gate `≥ max(60, SERP_median+10)`; density hard-fail `>2.5%`; Stage E max-2 reflow | RE §3.4, Publishing §1.2 |
| Human-in-the-loop | `OS_final ≥ 85` ∨ `cost > budget_alert` ∨ `task_type ∈ high_risk` → Telegram/dashboard approval; draft scorecard at checkpoint | Data Engine §2.3.4, RE §5.3 |
| Closed feedback loop | `recalibrateFromOutcomes()` refits `w_i`, `impact_mult`, admission floor from measured GA4/GSC lift nightly | Data Engine §2.3.5, RE §3.4 |

**New integration touch-points** (for the implementing engineer): register `handle_publish` in `worker.py` `HANDLERS`; add `agentKey ∈ {"trends-ingest","serp-scrape","publish"}` handlers; extend the `completeJob` agent-persist switch (`jobs.ts` ~line 117) with a `publish` branch writing `cmsUrl`/`publishedAt`/`status="published"` and the receipt union onto the `articles` row; add typed tables `signal_raw`, `signal`, `entity`, `competitor_signal`, `task_candidate(dedup_key UNIQUE)`, `serp_snapshot`, `publish_receipts((article_id,revision,target_id) UNIQUE)`; add `PublishJobRequest` to `schemas.ts`. No migration needed on `articles` (already carries `cmsUrl`, `publishedAt`, `status`).

---

## Appendix A — Engineering Pillars 2–4 (Detailed Narrative)

The numbered deliverables above are distilled from the full engineering analyses below: the self-sustaining ingestion engine (Pillar 2), the multi-CMS publishing pipeline (Pillar 3), and the closed-loop analytics + resiliency engine (Pillar 4).

Verifications confirm the key volatile facts: Google Ads API is at v24 (latest stable) with `KeywordPlanIdeaService.GenerateKeywordIdeas`, and the official Google Trends API is alpha-only in 2026 while pytrends is archived — both materially affecting the ingestion design. I have what I need to write a production-grade section.

### Pillar 2 - Self-Sustaining Ingestion & Data Engine

This pillar is the platform's sensory cortex: it converts noisy external signals into a deduped, freshness-weighted, prioritized stream of autonomous task candidates. Everything downstream (drafting, optimization, publishing) consumes the `task_candidate` table this engine produces. The design assumes adversarial data sources (rate limits, archived libraries, schema drift) and degrades gracefully rather than failing.

#### 2.0 Source reality check (2026) and ingestion topology

Before scoring, the engine must reconcile what each source actually provides in 2026, because two of the four "live data" sources are not the clean public APIs people assume:

| Source | Real 2026 access path | Auth | Hard limits | Freshness |
|---|---|---|---|---|
| Google Trends | **No stable public API.** Official Trends API is alpha-gated (allowlist, interest-over-time + top-trends + related-queries only). pytrends is **archived (read-only since 2025-04-17)**. | Alpha API key if allowlisted; otherwise headless fetch of `trends.google.com/trends/api/*` (`widgetdata/multiline`, `relatedsearches`) via the Playwright worker pool. | Alpha quota ~ low thousands/day; scraped endpoint throttles ~ 1 req/1.5–4s/IP, 429 on burst | Daily for `interest_over_time`; hourly for `realtime/trending` |
| Keyword Planner | **Google Ads API v24** `KeywordPlanIdeaService.GenerateKeywordIdeas` + `GenerateKeywordHistoricalMetrics` | OAuth2 + developer token (Basic access ≥ 15k ops/day) | 15k operations/day (Basic), 40 QPS; volumes returned **bucketed**, not exact | Monthly `monthlySearchVolumes[]` (rolling 12 mo, ~1 mo lag) |
| GA4 | **GA4 Data API v1beta** `runReport` / `runRealtimeReport` | OAuth2 service account | 1,250 tokens/property/hr, 10 concurrent | Realtime ≤ 30 min; standard ~ 24–48h finalization |
| Search Console | **Search Analytics API** `searchanalytics.query` | OAuth2 | 1,200 QPM, 50k rows/req, 16-mo window | 2–3 day data lag |

Topology: stateless **Next.js route handlers / Fluid Compute functions** own OAuth token refresh and API calls (Trends-alpha, Ads, GA4, GSC). The **Python Playwright worker pool** (BullMQ-consumed) owns everything that requires a real browser: Trends scraped endpoints and all SERP/competitor scraping. Both write **raw** payloads (immutable, hashed) into `signal_raw`; a normalizer maps them into `signal` rows keyed by `(entity, geo, source, observed_at)`. Redis holds short-TTL response caches and the token-bucket rate limiters; Postgres holds the durable signal history that velocity/acceleration math reads from.

```
signal_raw(id, source, fetch_hash UNIQUE, payload jsonb, fetched_at, ttl)
signal(entity_id, source, geo, metric, value numeric, observed_at,
       confidence numeric, decayed_weight numeric)   -- time-series, BRIN on observed_at
entity(id, surface_form, normalized, kgmid text NULL, type)  -- keyword | topic | competitor_url
```

---

#### 2.1 Trends + Keyword Planner: velocity, acceleration, and commercial cross-reference

##### 2.1.1 Normalize the Trends series

Google Trends returns a **relative 0–100 interest index**, not absolute volume — it is non-stationary and must never be compared across separate pulls without an anchor. For each tracked entity we pull a **rolling 90-day daily series** `I[t]` and a co-requested **anchor keyword** of known stable volume in the same request (Trends normalizes all terms in one request against the same max, so the anchor lets us reconstruct pseudo-absolute volume): `V̂[t] = I[t] × (anchorVolume / I_anchor[t])`, where `anchorVolume` comes from Keyword Planner. This kills the "everything is relative" trap.

We then smooth with a 7-day EMA to suppress weekday seasonality before differentiating:
`S[t] = α·V̂[t] + (1−α)·S[t−1]`, `α = 2/(7+1) = 0.25`.

##### 2.1.2 Velocity and acceleration

- **Velocity** (first derivative, normalized growth rate over the trailing window `w = 7d`):
  `velocity = (S[t] − S[t−w]) / (S[t−w] + ε)`,  `ε = 1.0` to avoid divide-by-zero on cold terms.
- **Acceleration** (second derivative — is the growth itself speeding up? This is what separates a true breakout from a term that already plateaued):
  `accel = ((S[t] − S[t−w]) − (S[t−w] − S[t−2w])) / (S[t−2w] + ε)`.

A term is a **rising candidate** only if `velocity ≥ 0.20` (≥20% WoW) **AND** `accel > 0`. Acceleration > 0 is the non-negotiable gate: it rejects "fading fads" that still show high week-over-week velocity purely because of a high base two weeks ago. We additionally compute a **z-score breakout flag** against the entity's own trailing-90d distribution: `z = (V̂[t] − μ₉₀)/σ₉₀`; `z ≥ 2.5` marks a statistical breakout that bypasses the normal velocity floor (handles zero-history viral spikes, e.g. Trends "Trending now" / `dailytrends`).

##### 2.1.3 Commercial-intent cross-reference (Keyword Planner)

For every rising entity, hydrate from `GenerateKeywordIdeas`/`GenerateKeywordHistoricalMetrics`:
- `avgMonthlySearches` (we use the bucket midpoint; Google returns ranges)
- `competition` ∈ {LOW, MEDIUM, HIGH} → map to `{0.2, 0.5, 0.85}`
- `competitionIndex` (0–100) — preferred when present, `/100`
- `lowTopOfPageBidMicros`, `highTopOfPageBidMicros` → `cpc = (low+high)/2 / 1e6` (currency from customer)

**Commercial Intent Score** (0–1), log-compressing CPC so a $40 CPC term doesn't swamp everything:
```
CI = 0.55 · sigmoid( (ln(cpc+1) − ln(cpc_med+1)) / cpc_iqr )
   + 0.30 · clamp(avgMonthlySearches / volume_ref, 0, 1)
   + 0.15 · intentClass            // {transactional:1.0, commercial:0.8, informational:0.4, nav:0.1}
```
`cpc_med`, `cpc_iqr`, `volume_ref` are per-vertical rolling baselines (recomputed nightly) so the score is self-calibrating to the site's niche. `intentClass` is assigned by a cheap classifier on the query surface form (modifiers: `buy|price|coupon|best|review|vs|near me|how|what`).

##### 2.1.4 Difficulty (organic, not paid)

Paid `competition` ≠ organic ranking difficulty. We compute a **Keyword Difficulty (KD, 0–100)** primarily from the live SERP (§2.2), so it's an input here but produced there:
```
KD = 0.45·avg_ref_domains_top10_norm   // backlink strength of ranking pages
   + 0.25·avg_DR_top10_norm            // domain authority proxy
   + 0.15·title_exact_match_ratio      // how saturated the intent already is
   + 0.10·serp_feature_penalty         // PAA/featured-snippet/ads crowding
   + 0.05·content_depth_norm           // median word count / schema richness of top10
```
Backstop when SERP data is stale: `KD ≈ 100·competitionIndex/100·0.6 + log-volume·0.4`.

---

#### 2.2 Competitor intelligence & SERP scraping/parsing pipeline

##### 2.2.1 Acquisition

For each target keyword cluster, the Playwright worker pool fetches the live SERP (rotating residential egress, locale + geo pinned to match the GSC/GA4 property, JS-rendered to capture PAA and dynamic SERP features). We extract the **top-10 organic URLs** plus SERP-feature inventory (featured snippet owner, PAA questions, image/video packs, ads count). Each competitor URL is then fetched and rendered. **robots.txt and crawl-delay are honored**; per-domain politeness via Redis token bucket (default 1 req / 3s / domain, exponential backoff on 429/503). Every fetch is content-hashed (`sha256` of normalized DOM) so unchanged pages cost nothing downstream.

##### 2.2.2 DOM / structure extraction

Per competitor page we parse (lxml/selectolax for speed, Playwright accessibility tree as fallback):
- **Heading skeleton**: ordered `(h1..h4)` outline → the page's *information architecture*. Stored as a normalized heading vector.
- **Content metrics**: word count, reading grade (Flesch–Kincaid), internal/external link counts, image count + `alt` coverage, `tl;dr`/table/list density.
- **On-page targeting**: `<title>`, meta description, canonical, OG/Twitter, `hreflang`.

##### 2.2.3 schema.org / structured-data detection

Parse all three syntaxes — **JSON-LD** (`script[type="application/ld+json"]`, primary), **Microdata** (`itemscope/itemtype`), **RDFa**. Resolve `@type` against schema.org vocab; record the **type set** per page (e.g. `{Article, FAQPage, BreadcrumbList, Product, HowTo}`) and validate required-property completeness (e.g. `Product` → `offers.price`, `aggregateRating`). The cluster-level **schema gap** = types present on ≥40% of top-10 competitors but absent on our own page → a direct, high-precision task candidate (`type: schema_enrich`).

##### 2.2.4 Entity-density measurement

This is how we reverse-engineer *topical coverage*, not just keywords. For each competitor page and the merged top-10 corpus:
1. Extract entities/noun-phrases (spaCy NER + noun-chunking; optionally reconcile to **Google Knowledge Graph `kgmid`** via the KG Search API for canonical IDs so "NYC" == "New York City").
2. Compute **entity density** per entity `e`:  `density(e) = count(e) / total_tokens` (per page), and the corpus **salience** as TF-IDF of the entity against a background vertical corpus.
3. Build the **expected entity set** `E* = { e : DF_top10(e) ≥ 0.5 }` (entities appearing on ≥half of ranking pages = the entities Google evidently expects for this intent).
4. **Coverage gap** for our page: `gap = E* \ E_ours`, weighted by salience. `entity_gap_score = Σ_{e∈gap} salience(e)` normalized to 0–1. High gap on a page we already rank for → `type: content_optimize`; high gap with no page → `type: content_create`.

##### 2.2.5 Content-cluster & "new content" detection over time

We snapshot each competitor's published-URL inventory (sitemaps + crawl) and the entity-coverage matrix on a cadence (`tier-1 competitors: every 24h`, others weekly). Two change detectors:
- **New-cluster detection**: cluster all observed competitor URLs by entity-vector cosine similarity (HDBSCAN over embeddings). A cluster whose **member count or aggregate entity-density rises ≥ 30% within 14 days across ≥2 distinct competitors** is flagged as an emerging content cluster → high-priority `type: cluster_expand`. The "≥2 distinct competitors" rule prevents chasing a single competitor's idiosyncratic bet.
- **Page-delta detection**: per-URL DOM hash + heading-vector diff. A competitor materially expanding a page (word count +25% or new schema type or new H2 entities) that *outranks us* → `type: content_optimize` on the matching page.

All competitor observations land in `competitor_signal(competitor_url, cluster_id, entity_vector, schema_types[], word_count, dom_hash, observed_at)`.

---

#### 2.3 From raw signals → prioritized autonomous task candidates

##### 2.3.1 Dedup (entity resolution, not string match)

Three-stage collapse so "best running shoes", "top running shoes 2026", and "running shoes review" don't become three competing tasks:
1. **Exact**: normalize (lowercase, strip diacritics/stopwords/punctuation, lemmatize) → SHA-1 key.
2. **Near-dup**: MinHash/LSH on token shingles, **Jaccard ≥ 0.82** → merge.
3. **Semantic**: embed surface forms; **cosine ≥ 0.90** *and* shared dominant `kgmid`/intent → merge into one `entity_id`.
Signals from all sources attach to the surviving `entity_id`; provenance is preserved in `signal.source`. A `task_candidate` carries a `dedup_key = (entity_id, task_type)` with a **UNIQUE** constraint so the same intent can't be queued twice (re-observation updates score in place, see admission rule).

##### 2.3.2 Freshness weighting

Every signal's contribution decays exponentially with **source-specific half-lives** (Trends spikes are perishable; GSC trends are durable):
`decayed_weight = base_confidence · 0.5^(age_hours / half_life)`
`half_life`: Trends-realtime = 12h, Trends-daily = 72h, SERP/competitor = 168h (7d), Keyword Planner volume = 720h (30d), GA4/GSC = 336h (14d). `base_confidence` is the source reliability prior (scraped Trends 0.7, official APIs 0.95) × payload completeness. A signal below `decayed_weight < 0.05` is excluded from scoring (but retained for history).

##### 2.3.3 Candidate score

Each candidate gets a single **Opportunity Score (OS, 0–100)** combining demand, growth, commercial value, achievability, and strategic fit, all freshness-weighted:

```
OS = 100 · Σ_i [ w_i · component_i · decayed_weight_i ] / Σ_i [ w_i · decayed_weight_i ]

components (each 0–1):
  Demand        = clamp(log10(avgMonthlySearches+1) / log10(volume_ref+1), 0,1)   w=0.22
  Momentum      = clamp(0.6·norm(velocity) + 0.4·norm(accel), 0,1)                w=0.20
  CommercialInt = CI (§2.1.3)                                                      w=0.18
  Achievability = 1 − KD/100                                                       w=0.18
  GapMagnitude  = max(entity_gap_score, schema_gap_flag)                           w=0.12
  StrategicFit  = cosine(entity_embedding, site_topic_centroid)                    w=0.10
```
- `Momentum` carries a **hard veto**: if `accel ≤ 0` AND not a z-breakout, `Momentum` is floored to 0 and the candidate cannot be `type ∈ {content_create, cluster_expand}` (only maintenance types).
- `StrategicFit` against the **site topic centroid** keeps the autonomous engine on-domain — a viral but off-topic term scores low and won't hijack the roadmap.
- A `task_type`-specific **expected-impact multiplier** is applied last: `OS_final = OS · impact_mult[task_type]` where `content_optimize` on an existing page that ranks #4–15 (striking-distance, from GSC `position`) gets `1.3` (cheap, high-yield), net-new `content_create` gets `1.0`, `schema_enrich` `0.9`.

##### 2.3.4 Queue-admission rule

A candidate is admitted to the BullMQ work queue only if **all** hold:

1. **Threshold**: `OS_final ≥ 60` (tunable per site; learned floor from §Pillar feedback — admission threshold auto-raises if the realized ROI of recently shipped tasks underperforms).
2. **Novelty / no-collision**: no existing `task_candidate` with the same `dedup_key` in state `{queued, in_progress, published<90d}`. Re-observation of an in-flight intent **updates the score and bumps priority**, it does not enqueue a duplicate (`ON CONFLICT (dedup_key) DO UPDATE SET os = GREATEST(...)`).
3. **Capacity / budget**: token-bucket admission so the engine self-paces against (a) provider API quotas, (b) publishing rate limits per CMS, and (c) a per-cycle content budget. Admission is **rate-limited, not just thresholded** — even 100 OS=95 candidates drain at the configured `max_tasks/cycle`.
4. **Confidence floor**: `Σ decayed_weight_i ≥ τ_conf` (default 0.5) — a candidate built only from a single stale/low-trust signal is held in `pending_corroboration` until a second independent source confirms it. This is the core anti-noise guarantee.
5. **Human-in-the-loop gate**: candidates with `OS_final ≥ 85` **or** `estimated_cost > budget_alert` **or** `task_type ∈ {high_risk_set}` are routed to an **approval checkpoint** (Telegram/dashboard) before claiming a worker; everything else is admitted autonomously.

Priority within the queue = `OS_final`, with **starvation protection**: a held candidate's effective priority gets `+5/week` aging so durable-but-modest opportunities eventually surface rather than being permanently buried under perishable spikes.

BullMQ job payload:
```jsonc
{ "candidate_id","entity_id","task_type","os_final","components",
  "signal_provenance":[{source,observed_at,decayed_weight}],
  "serp_snapshot_id","target_url"|null,"approval_required":bool }
```

##### 2.3.5 Failure modes & guarantees (why this is "indestructible")

- **Trends source loss** (alpha revoked / scrape blocked): velocity/accel degrade to Keyword Planner `monthlySearchVolumes[]` MoM deltas; `base_confidence` drops, raising the corroboration bar — the engine slows but never emits garbage.
- **Quota exhaustion**: per-source token buckets shed load by deferring lowest-OS fetches; `signal_raw` cache (Redis TTL = half_life/4) serves stale-but-flagged data.
- **Schema drift / parse failure**: content-hash + JSON-schema validation on every payload; a failed parse writes a `signal_quality_error`, never a silent zero (which would poison TF-IDF baselines).
- **Self-correction loop**: realized GA4/GSC outcomes of shipped tasks feed back as labels that nightly recalibrate the component weights `w_i`, the `impact_mult` table, and the OS admission floor — closing the loop so the data engine's prioritization improves against *measured* ranking/traffic lift, not just predicted opportunity.

Sources: [Google Ads API — Generate keyword ideas](https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas), [GenerateKeywordIdeas (v24 RPC reference)](https://developers.google.com/google-ads/api/reference/rpc/v21/KeywordPlanIdeaService/GenerateKeywordIdeas), [pytrends (archived)](https://github.com/GeneralMills/pytrends), [Google Trends API status / alternatives 2026](https://www.scrapingbee.com/blog/best-google-trends-api/).

I now have full grounding in the codebase: the `ContentBundle` must align with the existing `articles` table and the Python content agent's output shape; the publisher worker must follow the same idempotent claim/complete/fail job pattern in `jobs.ts` and `worker.py`. This is a design/specification deliverable, so I'll write the section directly rather than touching code.

### Pillar 3 - Multi-Agent Content Creation & Publishing

This pillar consumes the keyword strategy (Pillar 1) and competitor breakdown (Pillar 2) and produces published, schema-rich content across heterogeneous CMS targets. It is split into two decoupled subsystems: a **Drafting Engine** (synchronous-ish, LLM-bound, runs in the Python worker pool as agents `content-writing` / `seo-optimization`) and a **Publisher Worker** (idempotent, side-effect-heavy, runs as agent `publish` with per-target adapters). They communicate only through the `articles` table and a normalized `ContentBundle`, never by direct call.

---

#### 1. The Drafting Engine

##### 1.1 Inputs — the `DraftBrief`

The engine is invoked with a single immutable brief assembled by the Director from upstream pillars. This extends the current `content-writing` payload (`title`, `brief`, `targetKeyword`, `wordTarget`, `intent`) with the competitor and entity context that today is missing.

```ts
interface DraftBrief {
  ideaId: number;
  cycleId: number | null;
  siteId: number;                    // multi-site (site_integrations drives publish targets)
  // --- strategy (Pillar 1) ---
  primaryKeyword: string;
  secondaryKeywords: string[];       // ranked; injected into H2/H3 + body at controlled density
  intent: "informational" | "commercial" | "transactional" | "navigational";
  searchVolume: number;
  competitionScore: number;          // 0..1, from keywords.competitionScore
  // --- competitor breakdown (Pillar 2) ---
  serpFeatures: ("paa" | "featured_snippet" | "image_pack" | "video" | "knowledge_panel")[];
  competitorOutlines: CompetitorOutline[];   // top 5-10 ranking pages, parsed
  entityGraph: EntityRef[];          // salient entities mined from the SERP corpus
  paaQuestions: string[];            // People-Also-Ask, drives FAQPage schema
  targetWordCount: number;           // derived from competitor median * 1.15 (see 1.3)
  // --- governance ---
  brandVoice?: BrandVoiceProfile;    // from kv_settings, optional
  internalLinkCandidates: InternalLink[];    // existing published articles for same site
}

interface CompetitorOutline {
  url: string;
  rankPosition: number;
  wordCount: number;
  headings: { level: 2 | 3; text: string }[];
  schemaTypes: string[];             // schema.org @types they emit (Article, FAQPage, HowTo…)
}

interface EntityRef {
  name: string;
  type: "Person" | "Organization" | "Product" | "Place" | "Thing" | "Concept";
  wikidataId?: string;               // Q-number when resolvable → sameAs links + about[]
  salience: number;                  // 0..1, TF-IDF-weighted SERP frequency
  coverageInCompetitors: number;     // fraction of competitors mentioning it (0..1)
}
```

##### 1.2 Pipeline stages

The engine is a deterministic state machine; each stage is a separate Gemini call with `responseSchema` enforced (via the existing `completeJson<T>` in `gemini.ts` / `complete(thinking_level=…)` in `_gemini.py`), so every stage output is validated JSON and individually retryable.

**Stage A — Outline synthesis.** Merge all `competitorOutlines[].headings` into a frequency-weighted heading graph. Cluster near-duplicate headings (cosine similarity ≥ 0.82 on embeddings, or trigram Jaccard ≥ 0.6 as a no-embedding fallback). Output a `ContentOutline`:

```ts
interface ContentOutline {
  h1: string;                        // ≠ metaTitle; question-form if intent=informational
  sections: OutlineSection[];
  faqBlock: { question: string; answerHint: string }[];  // ← paaQuestions, capped at 8
  estWordCount: number;
}
interface OutlineSection {
  h2: string;
  targetEntities: string[];          // EntityRef.name to inject in this section
  secondaryKeyword?: string;         // assigned ≤1 per section, no stuffing
  children: { h3: string; targetEntities: string[] }[];
  coversGap: boolean;                // true = topic absent from competitors (differentiation)
}
```

Coverage rule: every entity with `salience ≥ 0.4` **and** `coverageInCompetitors ≥ 0.5` MUST map to exactly one section (table-stakes coverage). Entities with `salience ≥ 0.4` but low competitor coverage are flagged `coversGap` to win differentiation. This is the "automatic contextual entity injection" mechanism — entities are bound to sections at outline time, not sprinkled post-hoc.

**Stage B — Draft expansion.** Per `OutlineSection`, generate body prose constrained to its assigned entities and ≤1 secondary keyword. Generating section-by-section (not whole-article in one shot) keeps each call inside the model's effective attention window, eliminates mid-article keyword drift, and lets a single failed section retry without rewriting the whole piece. Density governor: target primary-keyword density **0.8–1.5%**, hard-fail > 2.5% (keyword stuffing). Computed as `count(exactPhrase ∪ stemmedVariants) / totalWords`.

**Stage C — Semantic structure & on-page optimization.** Programmatically (not via LLM) derive every metadata field with hard length budgets, because LLMs are unreliable at character counts:

| Field | Rule | Hard limit |
|---|---|---|
| `metaTitle` | `${primaryKeyword} brand-suffix`, front-loaded keyword | ≤ 60 chars (truncate at word boundary) |
| `metaDescription` | extractive summary of intro + 1 secondary keyword, active voice, CTA verb | ≤ 155 chars |
| `slug` | `_slugify(h1)`, dedupe vs `articles.slug` for that `siteId` (append `-2`, `-3`) | ≤ 60 chars |
| `ogTitle` | = metaTitle unless headline test variant supplied | ≤ 60 |
| `ogDescription` | = metaDescription | ≤ 200 |
| `imageAlt` (per image) | `${entityInSection} — ${descriptivePhrase}`, never keyword-only | ≤ 125 chars |
| H2/H3 | semantic hierarchy, no skipped levels, primary keyword in ≥1 H2 | — |

The current `content_agent.py` does steps for `metaTitle`/`metaDescription` but truncates with `[:57]+"..."` mid-word and skips OG/alt/schema entirely — Stage C replaces that with word-boundary truncation and the full field set.

**Stage D — Structured data / schema generation.** Emit JSON-LD chosen by intent + SERP features, validated against schema.org shape before persistence:

- Always: `Article` (or `BlogPosting`), with `headline`, `datePublished`, `dateModified`, `author` (Organization from site profile), `image`, `mainEntityOfPage`.
- `about[]` / `mentions[]`: each `EntityRef` with a `wikidataId` becomes `{ "@type": entity.type, "name", "sameAs": "https://www.wikidata.org/wiki/<Q>" }`. This is the schema-level entity injection that feeds Google's Knowledge Graph.
- If `paaQuestions.length ≥ 3` → append `FAQPage` with the Stage A `faqBlock`.
- If outline is step/procedure-shaped (≥ 3 ordered imperative H2s) → `HowTo`.
- `BreadcrumbList` always, derived from site taxonomy.

**Stage E — Self-audit gate.** Reuse the existing `qa` and `seo-optimization` agents. The draft is rejected back to Stage B (max 2 reflow attempts) if: any required entity missing, keyword density out of band, `metaDescription` empty/over-limit, heading levels skipped, or a referenced image lacks alt text. On pass, persist.

##### 1.3 Target word count formula

`targetWordCount = clamp(median(competitorWordCounts) * 1.15, 600, 3500)`, then rounded to nearest 100. The 1.15 multiplier targets modest depth advantage without triggering thin-vs-bloated penalties; clamp prevents a single 8000-word outlier from blowing the budget.

##### 1.4 The `ContentBundle` — the contract between engine and publisher

This is the single normalized artifact every adapter consumes. It is CMS-agnostic: no adapter ever reads `articles` directly. It is built from the `articles` row plus its schema/asset sidecars and is **immutable per `revision`**.

```ts
interface ContentBundle {
  // identity & idempotency
  articleId: number;
  siteId: number;
  revision: number;                  // bumps on any post-publish edit; drives update vs create
  idempotencyKey: string;            // sha256(articleId + revision + targetId) — see §2.3
  contentHash: string;               // sha256 of canonical body+meta; skip-publish if unchanged

  // canonical content (source of truth = Markdown)
  title: string;
  slug: string;
  bodyMarkdown: string;              // articles.body
  bodyHtml: string;                  // rendered server-side, sanitized allow-list
  excerpt: string;                   // = metaDescription

  // SEO surface
  seo: {
    metaTitle: string;
    metaDescription: string;
    canonicalUrl?: string;
    og: { title: string; description: string; type: "article"; image?: AssetRef };
    twitter: { card: "summary_large_image"; title: string; description: string };
    robots: "index,follow" | "noindex,follow";
  };

  // structured data (Stage D output) — array of JSON-LD objects
  schema: Record<string, unknown>[];

  // media to sideload (publisher uploads to each target's own library)
  assets: AssetRef[];

  // taxonomy hints; adapters map to their own native concepts
  taxonomy: {
    categories: string[];
    tags: string[];
    blogHandle?: string;             // Shopify blog handle / WP category slug
    collectionHandles?: string[];    // Shopify collections
    parentPageId?: string;           // WP/Shopify page nesting
  };

  // publish governance
  status: "draft" | "publish";       // requested terminal state at the target
  authorRef?: { name: string; email?: string; cmsUserId?: string };
  publishAt?: string;                // ISO; future-dated → scheduled
}

interface AssetRef {
  role: "hero" | "inline" | "og";
  sourceUrl: string;                 // where the worker fetches the bytes
  alt: string;                       // Stage C imageAlt, required, non-empty
  mime: string;
  checksum: string;                  // sha256 of bytes → dedupe in target media library
  width?: number; height?: number;
}

interface InternalLink { url: string; anchor: string; articleId: number; }
interface BrandVoiceProfile { tone: string; bannedPhrases: string[]; readingLevel: number; }
```

`bodyMarkdown` is the source of truth (stored in `articles.body`); `bodyHtml` is a derived, sanitized cache. Storing both lets the Markdown-native targets (Vercel) and the HTML-native targets (WordPress, Shopify) each consume their preferred form without re-rendering at publish time.

---

#### 2. The Publisher Worker

##### 2.1 Decoupling & queue integration

Publishing is enqueued exactly like every other agent: a `publish` job is inserted into `jobs` (`agentKey: "publish"`, payload `{ articleId, revision, targets?: string[] }`), claimed atomically via the existing `claimNextJob` (`UPDATE … FOR UPDATE SKIP LOCKED`), and finalized through the existing `completeJob` / `failJob` — including their idempotent `status='claimed'` guards (A-04) and exponential worker backoff (F-025). **No new queue infrastructure is introduced.** The Python worker registers one new handler:

```python
HANDLERS["publish"] = handle_publish   # alongside research, content-writing, …
```

The worker resolves enabled targets from `site_integrations` for `payload.articleId`'s `siteId`, builds the `ContentBundle` once, and fans out to each adapter. A `publish` job spawning N targets is **not** atomic across targets — each target is its own idempotent unit (§2.3), so a 2-of-3 partial success is a valid, resumable state, never a rollback.

##### 2.2 The Adapter Contract

Every target implements one interface. The worker core knows nothing CMS-specific; all provider quirks live behind this boundary.

```ts
interface PublishTarget {
  readonly id: string;               // "vercel" | "wordpress" | "shopify"
  readonly capabilities: {
    supportsScheduling: boolean;
    supportsDraftState: boolean;
    supportsMediaSideload: boolean;
    supportsOnDemandRevalidation: boolean;
    nativeFormat: "markdown" | "html" | "json";
  };

  // cheap config/credential check before any mutation
  preflight(ctx: PublishContext): Promise<PreflightResult>;

  // create-or-update; MUST be idempotent on bundle.idempotencyKey
  publish(bundle: ContentBundle, ctx: PublishContext): Promise<PublishResult>;

  // sideload one asset into the target's media library; MUST dedupe on checksum
  uploadAsset(asset: AssetRef, ctx: PublishContext): Promise<UploadedAsset>;

  // best-effort transition draft→live (for targets where publish() staged a draft)
  promote?(ref: PublishedRef, ctx: PublishContext): Promise<PublishResult>;

  // compensating action for rollback / unpublish
  unpublish?(ref: PublishedRef, ctx: PublishContext): Promise<void>;
}

interface PublishContext {
  siteId: number;
  integration: DecryptedIntegration; // creds from site_integrations (encrypted at rest)
  logger: (msg: string) => void;     // routes to worker log + runs.result
  now: Date;
}

interface PreflightResult { ok: boolean; reason?: string; }
interface UploadedAsset { remoteId: string; remoteUrl: string; deduped: boolean; }
interface PublishedRef { remoteId: string; remoteUrl: string; targetId: string; }
```

##### 2.3 The publish result / ACK contract

Every adapter returns the same envelope; the worker aggregates per target and writes the union into `jobs.result` → `runs.result` → mirrors `cmsUrl`/`publishedAt`/`status` onto the `articles` row (extending the existing `persistArticle` path in `jobs.ts`).

```ts
interface PublishResult {
  targetId: string;
  ack: "created" | "updated" | "noop" | "scheduled" | "failed";
  // noop = contentHash matched a prior publish → nothing sent (true idempotency)
  ref?: PublishedRef;                // remote id + live URL on success
  revisionPublished: number;
  idempotencyKey: string;            // echoed back; matches bundle
  durationMs: number;
  error?: {
    code: "AUTH" | "RATE_LIMIT" | "VALIDATION" | "CONFLICT" | "UPSTREAM_5XX" | "NETWORK";
    message: string;
    retryable: boolean;              // RATE_LIMIT/UPSTREAM_5XX/NETWORK → true; AUTH/VALIDATION → false
    retryAfterMs?: number;           // honored from Retry-After header
  };
}
```

**Idempotency model (the core durability guarantee).** Each target maintains a `publish_receipts` row keyed by `(articleId, revision, targetId)` carrying `idempotencyKey`, `contentHash`, and the returned `remoteId`. On `publish()`:

1. If a receipt exists for this `idempotencyKey` **and** its `contentHash` equals the bundle's → return `ack: "noop"` without touching the CMS.
2. If a receipt exists with a `remoteId` but a different `contentHash` (a post-publish edit, higher `revision`) → issue an **update** against `remoteId`, not a create. This is what makes re-running a `publish` job safe and what prevents duplicate posts when the worker's completion ACK is lost (the same lost-ACK race already handled server-side by A-04).
3. No receipt → create, then persist the receipt **in the same logical step** as recording `remoteId`.

`retryable: false` errors (AUTH, VALIDATION) are reported via `failJob(retry=false)` → surface to the human-in-the-loop gate (Telegram approval) rather than spinning. `retryable: true` errors return through `failJob(retry=true)` and ride the worker's existing `2^attempts * 5s` backoff.

##### 2.4 Adapter: Vercel (Git-driven + ISR)

Vercel has no content API — publishing means committing content files to the site repo and triggering revalidation.

- **`nativeFormat: "json"`** (or MDX). The adapter writes `content/<slug>.json` (frontmatter-equivalent: title, seo, schema, body) plus `bodyMarkdown` as MDX when the site is MDX-based.
- **Mechanism — programmatic git commit via the GitHub Contents API** (`PUT /repos/{owner}/{repo}/contents/{path}`), not a local clone. The adapter:
  1. `GET` the existing file's blob `sha` (needed for updates; absence ⇒ create).
  2. `PUT` with `{ message, content: base64(file), sha?, branch }`. The commit `sha` becomes `remoteId`. Using the file `sha` as the optimistic-concurrency token makes the commit itself idempotent — a replayed commit with a stale `sha` returns 409 `CONFLICT` (retryable after re-reading), so we never double-commit.
  3. Optionally open/auto-merge a PR when the site requires review (`supportsDraftState` via branch-per-article + draft PR).
- **ISR on-demand revalidation:** after the deploy webhook confirms the commit built, `POST` the site's `/api/revalidate?path=/<slug>&secret=…` (Next.js `revalidatePath`) — the exact pattern already used by the on-demand revalidation referenced in `next.config.ts`/`vercel.json`. `revisionPublished` only advances after a `200` from revalidation; a failed revalidate is `retryable`.
- **`capabilities`:** scheduling `false` (use `publishAt` → defer the job), draft via PR `true`, media sideload `true` (commit into `public/images/`), on-demand revalidation `true`.

##### 2.5 Adapter: WordPress (REST, with media sideload)

- **`nativeFormat: "html"`.** Uses the WP REST API (`/wp-json/wp/v2`). GraphQL (WPGraphQL) is an optional swap behind the same adapter for read-heavy taxonomy lookups, but writes go through REST since WPGraphQL mutations require extra plugins.
- **Media sideload first (ordering matters):** for each `AssetRef`, `POST /wp/v2/media` (multipart, `Content-Disposition: attachment; filename=`), set `alt_text` from `asset.alt`. Dedupe by querying `?search=<checksum>` stored in the media `description`/meta before upload → `deduped: true`. Hero asset's returned media `id` becomes the post `featured_media`.
- **Create/update post:** `POST /wp/v2/posts` (create) or `POST /wp/v2/posts/{id}` (update, when receipt has `remoteId`). Map `status: "draft" → "draft"`, `"publish" → "publish"`; future `publishAt` → `status: "future"` + `date_gmt`. Body = `bodyHtml`; categories/tags resolved to term IDs via `/wp/v2/categories?slug=` (create-if-missing). JSON-LD injected as a `<script type="application/ld+json">` block appended to `content.raw` (or via a meta field if the theme renders schema from meta).
- **Draft→live promotion:** `promote()` = `POST /wp/v2/posts/{id}` with `{ status: "publish" }`, gated on the human content-approval gate (Gate B/C in `approvals`).
- **Idempotency:** WP has no native idempotency key, so it is enforced entirely by our `publish_receipts.remoteId` (the WP post ID) — never by slug, since slugs can collide/auto-suffix.
- **`capabilities`:** scheduling `true`, draft `true`, media sideload `true`, revalidation `false`.

##### 2.6 Adapter: Shopify (Admin API → blogs / collections / product pages)

- **`nativeFormat: "html"`.** Admin REST (`/admin/api/2024-x`) or GraphQL Admin API. Content maps to one of three surfaces, selected from `taxonomy`:
  - **Blog article** (default for `BlogPosting`): resolve `blogHandle` → blog `id` (`GET /blogs.json?handle=`), then `POST /blogs/{blog_id}/articles.json` (create) / `PUT …/articles/{id}.json` (update). `body_html` = `bodyHtml`; `summary_html` = excerpt; `image.alt` from hero `AssetRef`; `published` boolean from `status`; `published_at` for scheduling.
  - **Collection description / page** (`commercial`/`navigational` intent): `PUT /pages/{id}.json` or update a `custom_collection`'s `body_html`.
  - **Product page enrichment**: map to a `metafield` (`namespace: "seo", key: "long_description"`) on the product when the brief targets a product, **matching the existing template schema** — the adapter reads the product's metafield definitions first (`GET /metafield_definitions.json`) and only writes keys that exist, so it never breaks the theme's Liquid rendering.
- **Template-schema matching:** before any write, the adapter fetches the target object's current shape (article/page/metafield definitions) and projects the `ContentBundle` onto only the fields the live theme expects. JSON-LD goes into a theme-recognized metafield (`global.json_ld` or the article's `body_html` head block) rather than a foreign field.
- **Media:** Shopify Files API / `staged_uploads` for hero images; alt text via the file's `alt`. Dedupe by `checksum` stored in the file's alt-prefix or a tracking metafield.
- **Idempotency:** GraphQL Admin mutations accept no idempotency key, so again enforced by `publish_receipts.remoteId` (article/page/product GID). Use the `X-Shopify-Access-Token` + leaky-bucket awareness: on `429`, honor `Retry-After` → `error.retryAfterMs`.
- **`capabilities`:** scheduling `true` (`published_at`), draft `true` (`published:false`), media sideload `true`, revalidation `false`.

##### 2.7 Failure modes & guarantees (summary)

| Failure | Detection | Handling |
|---|---|---|
| Lost completion ACK (worker→server) | server idempotent transition (A-04) | safe no-op; no duplicate `articles`/receipt |
| Re-run of `publish` job | `idempotencyKey` + `contentHash` match | adapter returns `noop` |
| Post-publish edit | higher `revision`, `contentHash` differs | adapter issues **update** on stored `remoteId` |
| Partial multi-target (2/3) | per-target `PublishResult` | other targets unaffected; failed one retried independently |
| Auth/credential failure | `error.code=AUTH`, `retryable:false` | `failJob(retry=false)` → human gate via Telegram |
| Rate limit / 5xx | `error.code` + `retryAfterMs` | `failJob(retry=true)` → existing `2^attempts*5s` backoff |
| Git commit race (Vercel) | 409 on stale file `sha` | re-read blob `sha`, retry (`CONFLICT`, retryable) |
| Asset already in library | `checksum` match | `uploadAsset` returns `deduped:true`, reuses `remoteId` |

The end-to-end durability contract: a `publish` job may be delivered or replayed any number of times and, for a fixed `(articleId, revision)`, converges every target to exactly one live object reflecting that revision — the same exactly-once-effect guarantee the platform already provides for `research`/`content-writing` jobs, extended to external CMS side effects through receipt-based idempotency.

---

**Integration touch-points with existing code** (for the implementing engineer):
- `worker/worker.py` — register `handle_publish` in `HANDLERS`; resolve targets from the site's integrations.
- `src/lib/services/jobs.ts` — extend the `persistArticle`/agent-persist switch (line ~117) with a `publish` branch that writes `cmsUrl`, `publishedAt`, `status="published"`, and the per-target receipt union into the `articles` row.
- `src/lib/db/schema.ts` — add `publish_receipts` table `(articleId, revision, targetId, idempotencyKey, contentHash, remoteId, remoteUrl, ack, createdAt)` with a unique index on `(articleId, revision, targetId)`.
- `src/lib/validation/schemas.ts` — add `PublishJobRequest` and extend `UpdateArticleRequest` status enum is already publish-aware (`staged`/`published`).
- `articles` table already carries `cmsUrl`, `publishedAt`, `status` — no migration needed there; the `ContentBundle` maps cleanly onto existing columns plus the new schema/asset sidecars.

I have everything I need. The codebase confirms: `agent_state` table with `cooldown_until` (line 215) for anti-thrash, the frozen `performance.schema.json` with `rank_delta_7d`/`ctr`/`impressions`/`trend`, the stubbed GSC cron at `0 6 * * *`, Postgres-backed queue with `FOR UPDATE SKIP LOCKED`, idempotent guarded transitions, and worker exponential backoff `min(300, 5 * 2^attempts)`. I'll write the section grounding it in these real constructs while specifying the production-grade design.

### Pillar 4 - Closed-Loop Analytics & Resiliency

#### 1. GA4 Data API + GSC API Integration

Two ingestion sources, two cadences, one frozen output contract (`worker/performance.schema.json`, `schema_version "1.0"`). The daily Vercel cron `/api/cron/performance` (`vercel.json`: `0 6 * * *`, ~06:00 UTC, after Google's overnight GSC finalization) enqueues per-site `performance-pull` jobs the Python worker executes; results land in `performance.json` (per-site blob in Postgres) and a normalized `gsc_daily` / `ga4_daily` partitioned table for delta math.

**Search Console API (`searchconsole.searchanalytics.query`)** — the ranking source of truth.

| Metric | GSC field | Use |
|---|---|---|
| Impressions | `impressions` | demand denominator; min-sample gate |
| Clicks | `clicks` | conversion numerator |
| CTR | `ctr` (= clicks/impressions) | SERP-snippet quality signal |
| Average position | `position` | the slip/plateau trigger |

- **Dimensions**: query `["date","page","query"]` daily; also `["page","country","device"]` weekly for segmentation. `dataState: "all"` to include fresh (still-being-finalized) rows, but flag them — finalized data lags **2-3 days**, so deltas use a finalized-only window.
- **Data latency**: never compare `today` vs `today-1`. Compute deltas on the trailing finalized window: `rank_delta_7d = median(position[d-13..d-7]) − median(position[d-6..d-0_finalized])`. Median, not mean, kills single-day SERP-feature volatility. The schema's `rank_delta_7d`, `rank_current`, `ctr`, `impressions`, `clicks`, `first_indexed` map 1:1.
- **Sampling / row caps**: GSC returns ≤25k rows/request and **anonymizes** low-volume queries (they silently vanish — not zero). Paginate via `startRow` until a short page. Treat a missing query as `null` (schema convention: "no signal yet, don't deprioritize"), never as rank-loss.
- **Quota**: 1,200 QPM and 40k queries/day per Search Console property; per-site daily pull is ~hundreds of paginated calls — well inside quota. Quota is enforced **per property**, so a multi-site fleet parallelizes freely. Wrap in the same backoff/circuit-breaker as scraping (§3).

**GA4 Data API (`properties.runReport` / `runRealtimeReport`)** — the engagement source.

- **Metrics**: `engagementRate`, `averageSessionDuration`, `engagedSessions`, `bounceRate`, `conversions`, `screenPageViews`; dimension `landingPagePlusQueryString` to join to the GSC `page`.
- **Quota tokens**: GA4 bills in **tokens** (per-property-per-day, per-hour, concurrent). Wide dimension+metric reports cost more tokens; keep reports narrow, batch with `batchRunReports`, and read `propertyQuota` off each response to throttle pre-emptively.
- **Sampling**: standard properties sample above ~10M events in range. Detect via response metadata and **shrink the date range** (pull weekly slices, stitch client-side) rather than accept a sampled, non-reproducible number.
- **Latency**: GA4 standard processing lags 24-48h; the 06:00 UTC cron respects this.

**Storage / freshness contract.** Raw daily rows are append-only and idempotent on `(site_id, date, page, query)` via `ON CONFLICT DO UPDATE` — re-pulling a still-finalizing day overwrites, never duplicates. `performance.json` carries `last_updated`; readers older-than-48h treat it as stale and skip optimization decisions (no acting on phantom deltas).

#### 2. The Autonomous Optimization Loop

Runs after each performance pull. Per URL with a finalized window and `impressions ≥ MIN_SAMPLE (500/28d)` — below that there's no statistical signal and the URL is skipped (not penalized).

**Trigger conditions (GSC deltas, finalized window):**

- **SLIP** — `rank_delta_7d ≥ +3` positions worse AND `rank_current` was in top 20. Sharp, recent loss → likely a competitor move or freshness decay.
- **PLATEAU** — `|rank_delta_28d| < 1` AND `11 ≤ rank_current ≤ 20` AND `age ≥ 60d`. Stuck on page 2; needs a real intervention, not patience.
- **CTR-GAP** — `rank_current ≤ 10` BUT `ctr < 0.5 × expected_ctr(position)` (position-indexed CTR curve). Ranking is fine; the **snippet** underperforms → title/meta only, cheapest fix.
- **DECAY** — `impressions` down >30% over 28d at flat rank → query demand shifted; route to Research, not rewrite.

**Decision policy (cheapest effective action first; escalate only on repeated failure):**

| Trigger | Action | Agent / payload |
|---|---|---|
| CTR-GAP | Rewrite `<title>` + meta description against the top-CTR SERP competitor | `seo-optimization` |
| SLIP | Re-scrape top-3 competitors, diff coverage, rewrite/insert weak `<h2>` sections, refresh stats/dates | `content-writing` (revision mode) |
| PLATEAU | Expand thin sections to competitor median depth, add internal links **from** topical authority pages **to** this URL, add FAQ/`HowTo` schema | `content-writing` + `seo-optimization` |
| DECAY | Re-research the cluster; deprioritize if demand is structurally gone | `research` |

Internal-link architecture is treated as a graph mutation: PLATEAU pages get inbound links from the 3 highest-authority same-cluster pages (anchor = target keyword variant); links are inserted into the **source** articles' bodies and re-published, so the action is itself a tracked content job.

Each decision is enqueued via the existing `enqueueJob` path with `_directorContext` so the Director can narrate it, carrying an idempotency key (below) so the loop firing twice on overlapping windows can't double-edit.

**Anti-thrash guardrails** (the loop must not chase noise or fight itself):

- **Cooldown** — after any optimization, set `agent_state.cooldown_until = now + 21d` for that URL (the real `cooldown_until` column, line 215). SEO needs 2-4 weeks for Google to recrawl/re-rank; touching sooner measures noise. Loop hard-skips any URL with `cooldown_until > now`.
- **Min-sample** — the `impressions ≥ 500/28d` gate above; no acting on thin data.
- **Holdout** — a deterministic-hash **10% holdout** of eligible URLs is never auto-optimized. It's the counterfactual: if holdout and treated cohorts drift together, the gains were market-wide, not us — auto-scale back. Stored as `optimization_cohort ∈ {treated, holdout}`, assigned once at publish.
- **Change budget + significance** — ≤1 optimization per URL per cooldown; ≤N per cluster per week (avoids sitewide same-day churn that reads as manipulation). Require the delta to clear a noise band (median-based, ≥3 positions) before triggering — guards against day-to-day SERP jitter.
- **Auto-revert** — snapshot pre-edit `rank_current`; if rank is **worse** 28d post-edit, revert to the prior published revision and mark the URL `manual-review` rather than re-optimizing into a hole.

#### 3. Fault Tolerance

**Distributed queue.** The implemented design is a Postgres-backed queue (`src/lib/services/jobs.ts`) using `UPDATE jobs SET status='claimed' … WHERE id = (SELECT … WHERE status='queued' ORDER BY priority DESC, id ASC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING …`. `SKIP LOCKED` gives lock-free fan-out across N stateless Python workers with zero double-claim; serverless API stays thin while the long Playwright/Gemini work runs off-platform. (BullMQ/Redis is the drop-in upgrade for sub-second latency and rate-limiter groups; the claim/complete/fail contract is identical.) Workers long-poll `claim` every `POLL_INTERVAL` (5s) and expose `/health` for external liveness.

**Idempotency + state hydration / checkpointing.** A mid-flight Vercel or Shopify failure must resume the exact step without duplicating content or burning tokens:

- **Guarded transitions.** `completeJob` does `UPDATE jobs SET status='done' … WHERE id=? AND status='claimed' RETURNING`; if no row returns it's already finalized and **all** downstream effects (runs row, `keywords`/`ideas`/`articles` inserts, Telegram, Director callback) are skipped. So a worker that re-POSTs `complete` after the server already committed is a safe no-op — never a second article (`src/lib/services/jobs.ts:91-96`). `failJob` is symmetric (`status='claimed'` guard). The worker codifies this: a *report* failure after success **does not** call `fail_job`, precisely because completion is idempotent (`worker/worker.py:290-302`).
- **Stable idempotency keys** for external side-effects. Publish keys as `sha256(siteId|articleId|revision)`; persisted on first WordPress/Shopify/Vercel call. On resume, the worker checks for the remote object (Shopify `Idempotency-Key` header / lookup by stored external ID) **before** re-issuing — a crash between "published" and "marked-published locally" reconciles instead of re-posting. Gemini outputs are checkpointed to `result_cache` keyed on prompt-hash, so a retried content job rehydrates the prior generation rather than re-spending tokens.
- **Step-level checkpointing.** Multi-step jobs (research→draft→optimize→publish) write a `checkpoint` JSON on the job after each step. A reclaimed job (attempts++) reads `payload.checkpoint` and skips completed steps — fetch isn't redone, the draft isn't re-generated, only the unfinished tail runs.

**Anti-bot countermeasures** (scraper pool):

- **Proxy rotation** — residential/ISP pool, sticky-per-domain sessions, rotate on block; geo-pin to the SERP locale being measured.
- **Headless browser pool** — bounded Playwright pool (concurrency cap), real Chromium with stealth fingerprinting (UA/viewport/`navigator` consistency, human-cadence delays); recycle contexts to bound memory.
- **Request throttling** — token-bucket per target domain (BullMQ `limiter`/Celery `rate_limit`), randomized jitter, never burst a single host.
- **Exponential backoff** — already in the worker: transient handler failure backs off `min(300, 5 · 2^attempts)` s before re-claim (`worker/worker.py:278`), so an overloaded downstream isn't hammered and the job auto-requeues via `fail_job(retry=True)`.
- **Circuit breakers** — per-provider breaker (CLOSED→OPEN after K consecutive failures or a 429/403 spike → HALF-OPEN probe). OPEN sheds load to a degraded path: serve last-good `performance.json`, defer that provider's jobs, and emit a Telegram alert — the platform degrades, it never thrashes a blocked endpoint or burns quota into a wall.

**Grounding (files inspected):** `src/lib/services/jobs.ts` (claim/complete/fail idempotency), `worker/worker.py` (backoff, health, report-after-success safety), `worker/performance.schema.json` (frozen metrics contract), `src/app/api/cron/performance/route.ts` + `vercel.json` (daily GSC pull, currently stubbed pending OAuth), `src/lib/db/schema.ts:215` (`agent_state.cooldown_until`).

---

## Appendix B — Reverse-Engineering & Information-Gain Logic (Conceptual Basis)

The pseudo-code in §5 implements the scientific framework specified here.

### SEO Reverse-Engineering & Information-Gain Logic

This framework converts the top-ranking SERP for a target query into a structured corpus, computes what each competitor covers, derives what is *missing or under-served*, and emits a supersession outline engineered to dominate the intent. All stages are deterministic, cacheable, and re-runnable per cycle.

---

#### 0. Inputs & Corpus Construction

For target query `q` and locale `(geo, lang)`:

1. Fetch SERP top-N (`N = 10`, configurable to 20) via the Python Playwright worker pool. Persist per result:
   - `rank` (1..N), `url`, `domain`, `title`, `meta_description`
   - Raw HTML + rendered DOM (post-JS), `fetched_at`
   - SERP features present: featured_snippet, PAA (People Also Ask) questions, knowledge_panel, image_pack, video_pack, local_pack.
2. Boilerplate strip: run a readability extractor (Trafilatura/Readability-lxml) to isolate main `article` node. Discard nav, footer, sidebars, cookie banners, comment threads.
3. Each retained document `d_i` becomes a **SemanticProfile** (§1). The set `C = {d_1..d_N}` is the **SERP corpus**.

Hard failure modes: <3 extractable docs → abort cycle, flag `INSUFFICIENT_CORPUS`. JS-walled domains (403/CAPTCHA) → retry via residential proxy, else exclude and lower corpus-confidence weight `w_conf = extracted/N`.

---

#### 1. SemanticProfile: Deconstruction of a Winning Document

`SemanticProfile(d_i)` is the feature vector extracted per competitor:

**1.1 Heading / Topic Graph**
- Parse `h1..h4` into an ordered tree `T_i`. Each node = `{level, text, char_count, child_order}`.
- Embed each heading with a sentence-transformer (`text-embedding-3-large`, 3072-dim, or `bge-large-en-v1.5` for self-hosted). Store `vec(h)`.
- Section depth metric: `depth_i = Σ tokens(section)/heading_count` — proxies thoroughness.

**1.2 Entity Extraction (NER + Linking)**
- Run NER (spaCy `en_core_web_trf` or GLiNER for open-schema) → entities typed `{PERSON, ORG, PRODUCT, GPE, EVENT, WORK_OF_ART, LAW, DATE, QUANTITY, ...}`.
- Entity-link to a knowledge base (Wikidata QIDs via `wikifier`/`BLINK`) for canonicalization and synonym collapse (`"NYC" ≡ "New York City" ≡ Q60`).
- Per entity store: `{surface_forms, qid, type, freq, salience}` where salience = `tf · log(1+heading_proximity) · §position_weight`.
- Output `E_i` = canonicalized entity set with weights.

**1.3 Schema / Structured Data**
- Extract JSON-LD, Microdata, RDFa. Record `schema_types_i` ⊆ {Article, FAQPage, HowTo, Product, Recipe, Review, BreadcrumbList, VideoObject, ...}.
- Capture rich-result eligibility signals (FAQ Q/A pairs, HowTo steps, aggregateRating).

**1.4 Link Graph**
- Internal links: count, anchor texts, target-path topical labels.
- External links: count, target domains, authority tier (map domain → DR/DA bucket via cached Moz/Ahrefs-style proxy, or fall back to a static high-authority TLD/domain list).
- Citation density `cd_i = external_authoritative_links / 1000_words` — E-E-A-T proxy.

**1.5 Readability & Surface Metrics**
- `flesch_i`, `fk_grade_i`, mean sentence length, passive-voice ratio.
- `word_count_i`, media counts (`img`, `video`, `table`, `code`, `list`).
- Format inventory: presence of `comparison_table`, `tl;dr`, `step_list`, `data_chart`.

**1.6 Passage Embeddings**
- Chunk main content into passages `p` (256–512 tokens, 20% overlap). Embed each → `vec(p)` (same model as headings).
- `Emb(d_i)` = the matrix of passage vectors; `centroid(d_i)` = mean-pooled doc vector.

---

#### 2. SERP Aggregate Models

Built once over `C`:

- **Consensus centroid**: `μ_C = (1/N) Σ centroid(d_i)` — the topical "center of mass."
- **Entity frequency table** `EF`: for each canonical entity `e`, `df(e) = |{i : e ∈ E_i}|` (document frequency across corpus) and mean salience `s̄(e)`.
- **Heading-cluster map**: pool all heading vecs across `C`; cluster with HDBSCAN (cosine, `min_cluster_size=2`). Each cluster `k` = a **subtopic** with: representative label (medoid heading), `coverage(k) = |{docs touching k}| / N`, mean rank of covering docs.
- **Passage index**: all competitor passages in a vector store (FAISS/pgvector) for nearest-neighbor novelty checks.

---

#### 3. Information Gain Index (IGI)

Goal: quantify, for any candidate passage or our draft, how much *novel, query-relevant* information it adds versus the SERP corpus. Novelty without relevance is noise; both are required.

**3.1 Passage-level Information Gain**

For a candidate passage `p` (from our draft or a gap hypothesis):

- Relevance to query: `rel(p) = cos(vec(p), vec(q))`.
- Redundancy vs corpus: `red(p) = max_{p' ∈ PassageIndex} cos(vec(p), vec(p'))` (top-1 nearest neighbor).
- Novelty: `nov(p) = 1 − red(p)`.
- **Gain**: `IG(p) = rel(p) · nov(p)` — high only when relevant *and* unseen.

Thresholds: passage qualifies as **information-gain-positive** iff `rel(p) ≥ 0.30` AND `nov(p) ≥ 0.25` (i.e., `red(p) ≤ 0.75`). Tune per vertical via held-out SERPs.

**3.2 Entity Coverage Gap**

- Corpus entity set `E_C = ⋃ E_i`. For our draft `D` with entities `E_D`:
  - `entity_recall = |E_D ∩ E_C_core| / |E_C_core|`, where `E_C_core = {e : df(e)/N ≥ 0.5}` (entities ≥50% of competitors cite — table-stakes coverage).
  - **Missing-entity set** `M_E = E_C_core \ E_D` → mandatory inclusions.
  - **Differentiator entities** `Δ_E = E_D \ E_C` → novel entities none of the competitors mention (information gain at entity level); validate each for relevance `cos(vec(e), vec(q)) ≥ 0.35` to avoid drift.

**3.3 Subtopic Coverage Gap**

From the heading-cluster map (§2):
- **Under-served subtopics**: clusters with `coverage(k) ≤ 0.4` but high `rel(k) = cos(medoid(k), vec(q)) ≥ 0.45`. These are partial gaps competitors under-address → high-leverage sections.
- **Whitespace subtopics**: query-relevant clusters derivable from PAA + autosuggest + `related_searches` that have **zero** corpus coverage. Mine PAA/related questions, embed, and flag any with `nN-distance > 0.6` from every existing cluster medoid as net-new.

**3.4 Document-level IGI (aggregate score)**

```
IGI(D) = 100 · [ w1 · mean(IG(p) for p in gain_positive_passages(D))
               + w2 · entity_recall_core(D)
               + w3 · differentiator_density(D)
               + w4 · subtopic_coverage(D) ]
```
where `differentiator_density = |relevant(Δ_E)| / word_count_k`, `subtopic_coverage = covered_clusters / total_relevant_clusters`. Default weights `w = [0.40, 0.25, 0.15, 0.20]` (Σ=1), tunable. **Publish gate**: `IGI(D) ≥ max(60, median IGI(C) + 10)` — must beat the SERP median by a margin.

---

#### 4. Search-Intent Classification

Classify `q` into a primary intent (+ secondary) before outlining; intent dictates structure, schema, and CTA.

**4.1 Feature signals**
- Lexical: presence of intent markers — informational (`how, what, why, guide, tutorial, examples`), commercial (`best, top, review, vs, comparison, alternative`), transactional (`buy, price, discount, coupon, near me, order, for sale`), navigational (brand/domain token, login, official).
- SERP-shape signals (strong prior): featured snippet + PAA ⇒ informational; shopping/product packs + ads density ⇒ transactional; review/listicle dominance in titles ⇒ commercial-investigation; single-brand dominance ⇒ navigational.
- Title-pattern distribution across `C` (e.g., ≥5/10 titles contain "best"/"vs" ⇒ commercial).

**4.2 Classifier**
- Zero-shot LLM classifier over `{q, top-10 titles, SERP features}` → distribution over the four classes; take argmax as primary, second-highest >0.25 as secondary.
- Calibrate against a rules layer (lexical + SERP-shape) and take a weighted vote: `0.6·LLM + 0.4·rules`. Persist `intent = {primary, secondary, confidence}`.

**4.3 Intent → blueprint mapping**
- Informational → definition-first, depth, FAQPage + (HowTo if procedural) schema, internal links to related guides.
- Commercial → comparison tables, scoring criteria, pros/cons, "best for X" segments, Product/Review schema, aggregateRating.
- Transactional → concise, price/spec tables, buy CTAs, Product schema + Offer, trust signals.
- Navigational → minimal; ensure brand entity, sitelinks structure, Organization schema. (Usually deprioritized unless we own the brand.)

---

#### 5. Superior Variation Outline Generator

Synthesizes §1–§4 into a build-ready outline whose projected `IGI ≥ publish gate` and whose structure matches classified intent.

**5.1 Section assembly (priority-ordered)**

1. **Table-stakes skeleton**: include every heading-cluster with `coverage(k) ≥ 0.6` (consensus sections you cannot omit). Order by intent blueprint, not by competitor order.
2. **Gap-fill sections**: inject under-served (`coverage ≤ 0.4`, high `rel`) and whitespace subtopics from §3.3. Each becomes a section with an explicit `information_gain_target` (expected `IG` from novel passages).
3. **Differentiator blocks**: dedicated sections/components delivering `Δ_E` entities and net-new data — original research, proprietary data, calculators, expanded comparison axes competitors lack. These are the supersession levers.
4. **Format superiority**: for each consensus section, upgrade the dominant competitor format (e.g., if top docs use prose, emit a comparison/spec table or interactive widget; add `tl;dr`, summary tables, diagrams where IG-positive).

**5.2 Coverage targets emitted per outline**

```
OutlineSpec = {
  query, intent,
  target_word_count: max(percentile_75({word_count_i}), top3_mean + 15%),
  required_entities: E_C_core,                 // must cover (table stakes)
  differentiator_entities: relevant(Δ_E),      // must add (gain)
  sections: [
    { heading, type, source∈{consensus|gap|whitespace|differentiator},
      target_subentities: [...], target_depth_tokens,
      information_gain_target, suggested_format,
      internal_link_targets: [...], schema_hook }
  ],
  schema_plan: schema_types from intent blueprint ∪ ⋃ schema_types_i,
  projected_IGI, projected_reading_grade (match SERP median ±1)
}
```

**5.3 Generation & validation loop**

- Draft per `OutlineSpec`, then **score before publish**: recompute §3 IGI on the draft.
- If `IGI < gate`: identify the limiting term (low novelty ⇒ inject more `Δ_E`/original data; low entity_recall ⇒ add `M_E`; low subtopic_coverage ⇒ add missing clusters) and regenerate only the deficient sections (targeted, not full rewrite).
- Enforce **anti-cannibalization**: embed final draft centroid; if `cos(centroid_D, centroid_existing) ≥ 0.85` against our own published corpus, merge/redirect instead of publishing a near-duplicate.
- Emit to the human-in-the-loop checkpoint with the scorecard: `{IGI, entity_recall, missing_entities_remaining, differentiator_count, intent_match, projected vs SERP median}`.

---

#### 6. Scoring Function Reference (consolidated)

| Metric | Formula | Threshold / Target |
|---|---|---|
| Passage relevance | `rel(p)=cos(vec(p),vec(q))` | ≥ 0.30 |
| Passage novelty | `nov(p)=1−max cos(vec(p),vec(p'_corpus))` | ≥ 0.25 |
| Passage info-gain | `IG(p)=rel(p)·nov(p)` | maximize; >0.075 to count |
| Core entity set | `E_C_core={e:df(e)/N≥0.5}` | coverage target 100% |
| Entity recall | `|E_D∩E_C_core|/|E_C_core|` | ≥ 0.90 |
| Differentiator relevance | `cos(vec(e),vec(q))` | ≥ 0.35 |
| Under-served subtopic | `coverage(k)≤0.4 ∧ rel(k)≥0.45` | inject as section |
| Doc IGI | `100·Σ w_i·term_i` | ≥ max(60, median+10) |
| Anti-cannibalization | `cos(centroid_D, centroid_own)` | < 0.85 |

All embeddings L2-normalized; cosine = dot product. All thresholds are per-vertical calibratable against a labeled SERP hold-out set, persisted in the cycle config for reproducibility.
