# UTEONT — Left-Out / Not-Yet-Implemented Things

**A complete backlog of everything discussed, planned, scoped, stubbed, or deferred across this build — but not actually implemented.**

Compiled 2026-05-31 by walking the whole conversation from the start, the design
doc (`autonomous-seo-agent-platform-design.md`), the codebase, and the deploy
state.

> **Scope note.** This is the **feature / implementation** backlog. It is the
> complement to `GAPS_REPORT.md`, which is the **security / bugs / ops** audit
> (human-controlled, append-only — not duplicated here). For still-open security
> items see §K and that file.

---

## Implementation status — updated 2026-06-01

After the "implement everything" pass, the following shipped to production
(7 deployed increments / "waves"; all passed tsc + lint + build + pure tests):

**DONE**
- **LO-02** Revenue Optimization agent (live conversion audit) — *Wave 2*
- **LO-05 / LO-07 / LO-08** SEO intelligence engine = Content Brief agent
  (semantic profile + information-gain + coverage gaps) — *Wave 3*
- **LO-09** Content Draft agent (inline Gemini drafting on Vercel) — *Wave 4*
- **LO-13 / LO-33 / LO-34** projection confidence band + ± projection — *Wave 1*
- **LO-22 / LO-25** streaming agent runs (SSE live log + elapsed clock) — *Wave 7*
- **LO-26** GA4 client + GA4 metrics; **LO-28** Slack client — *Wave 8* (inert until secrets added)
- **LO-31** cron scheduling (`vercel.json`) + **LO-32** daily snapshot/GSC cron — *Wave 1*
- **LO-35** dashboard sparklines — *Wave 1*
- **LO-44** Settings operator hub (config checklist) — *Wave 9*
- **LO-53** CI workflow (tsc + lint + build on every push) — *Wave 9*
- **LO-12 / LO-14** explainability — DecisionRecord provenance + `/decisions`
  log (migration `0009` *staged*, applies when Neon returns) — *Wave 5*
- **LO-16 / LO-19** human-in-the-loop approvals — checkpoint queue + 5-verb
  decision machine + graduated friction + `/approvals` inbox (migration `0008`
  *staged*) — *Wave 6*

Agents went 10 → **14**, with **6 runnable credential-free** (Technical SEO,
Content Audit, Site Crawl, Revenue, Content Brief, Content Draft); target metrics
grew to ~16 (8 agent-driven closed loops).

**STILL OPEN**
- 🌐 *Blocked on the prolonged Neon outage* — staged migrations `0008`
  (checkpoints) + `0009` (decision_records) must be applied when the DB returns
  (I can do it in one command then, or `npm run db:migrate`), and **LO-36**
  campaigns/clusters still needs its own table + build.
- 🟠 *Buildable but deliberately not deployed blind*: **LO-39** Google sign-in
  (a NextAuth change — risky to ship while I can't test login), **LO-51** E2E
  tests (need a live DB + running app), **LO-15** counterfactuals, **LO-21**
  cognitive-guardrail polish, **LO-17/18** diff-review + undo, **LO-20** autonomy
  levels, **LO-04** live QA/SEO mode.
- 🔴 *Needs the worker host / a SERP or rank API*: **LO-06** live SERP scraping,
  **LO-11** closed-loop re-optimization, **LO-23/24** live feeds, **LO-27** rank,
  **LO-01/10/30** publishing + CMS clients.
- 🔑 *Operator-only* (unchanged): **LO-29/37/38** secrets to activate
  GSC/GA4/Slack; **LO-40/41/42/43** infra/env.

---

## Legend

| Mark | Meaning |
|---|---|
| 🔴 | Core to the product vision; big gap |
| 🟠 | Significant feature, scoped but unbuilt |
| 🟡 | Partial — a thin version exists, the full one doesn't |
| 🟢 | Polish / nice-to-have |
| 🔑 | **Blocked on operator action** (a secret/credential only you can provide) |
| 🌐 | Blocked on external infra (worker host, cron scheduling, OAuth app) |

---

## At a glance — what's live vs. what's left

**Live today (no credentials needed):** dashboard, multi-site model, Director NL
planner (Gemini), Targets / Control Panel with trajectory history + sparkline +
plateau detection, Next Best Action, and **three runnable audit agents**
(Technical SEO, Content Audit, Site Crawl) each feeding a closed-loop metric.

**Left out:** the deep "autonomous SEO engine" (SERP reverse-engineering +
information-gain), the generative/publishing half of the pipeline, real-time
streaming, explainability surfaces, the human-in-the-loop approval UX, most
integrations (GA4 / rank / publish targets), cron scheduling, and several
operator-only secrets. Detail below.

---

## A. Pipeline agents not built (or dependent on external infra)

- **LO-01 🔴 Publishing Agent** — `implemented: false`. No CMS publish path at
  all (staging or production). The design's receipt-based idempotent deploy
  (`deployIdempotent`, publish job handler) does not exist. Production publish
  was always gated behind human approval — that gate UX (§D) is also unbuilt.
- **LO-02 🟠 Revenue Optimization Agent** — `implemented: false`. CTA / affiliate
  / internal-link suggestions from performance data — not started.
- **LO-03 🌐 Generative worker agents depend on the external worker host.**
  Research, Idea Generation, Content Writing, and Backlink/Outreach are
  `runtime: "worker"` — they only run if the Python/Playwright worker
  (Railway/Fly) is live **and** `GEMINI_API_KEY` is set in the worker env. The
  worker's health was **not verified this session**. If it is down, ~4 of the
  "implemented" agents silently can't run.
- **LO-04 🟡 QA & SEO-Optimization act only on text you paste in.** They take an
  `article` string in the payload; they don't fetch the live site like the three
  audit agents. Fine by design, but they are not "one-click against your site."

## B. The core autonomous-SEO intelligence engine (design §5 / Pillars 2–4) — largely unbuilt

This is the heart of the design doc and the biggest gap. The current agents are
lightweight public-HTML audits; the differentiating engine below does not exist.

- **LO-05 🔴 Trend ingestion & scoring** (`ingestAndScoreTrends`) — perishable
  signals (Trends/Reddit/etc.) → prioritized task candidates.
- **LO-06 🔴 Live SERP scraping + parsing** (`scrapeAndParseSerp`, Playwright
  anti-bot pool). No real SERP analysis today.
- **LO-07 🔴 Semantic profile deconstruction** — reverse-engineer a winning
  competitor document into its structure/entities.
- **LO-08 🔴 Information-gain + coverage-gap computation** — the actual
  "beat the SERP median by a margin" logic that decides what to write.
- **LO-09 🔴 Superior outline → draft synthesis** with entity + meta/OG/alt
  injection (beyond the basic content-writing worker handler).
- **LO-10 🔴 Content bundle build + idempotent deploy** (receipt-based durability).
- **LO-11 🔴 Closed-loop re-optimization** (`checkRankAndMaybeReoptimize`) —
  GSC-measured lift recalibrates the scoring nightly. The data side (GSC) now
  exists (§F) but nothing consumes it to trigger re-writes.

## C. Explainability & decision provenance (design §Explainability) — not built

- **LO-12 🟠 DecisionRecord schema + provenance trail** ("why this keyword?",
  the evidence behind each agent action).
- **LO-13 🟡 Honest confidence bands.** The Target panel shows a status
  (on/at-risk/off-track) and now a trajectory, but not the confidence interval
  the spec called for.
- **LO-14 🟠 Competitor evidence map** — reverse-engineering surface.
- **LO-15 🟢 Counterfactuals** ("what if we hadn't done X").

## D. Human-in-the-loop / approvals / autonomy (design §IxD + §Responsibility) — not built

The `approvals` table exists; the rich UX/state machine around it does not.

- **LO-16 🟠 Checkpoint state machine + the five decision verbs.**
- **LO-17 🟠 Diff review of proposed page edits** before they apply.
- **LO-18 🟠 One-click undo + undo timing model.**
- **LO-19 🟠 Blast-radius preview** (pre-flight: "this will touch N pages").
- **LO-20 🟠 Autonomy levels (L1–L4)**, guardrail envelope, escalation triggers,
  accountability ledger.
- **LO-21 🟡 Cognitive guardrails** — "quiet by default," severity-ranked
  attention routing, progressive disclosure, fatigue-defeating approvals.

## E. Real-time / streaming (design §2 micro-interactions) — deferred all session

- **LO-22 🟠 Streaming agent logs (SSE).** Explicitly deferred multiple times —
  needs an SSE/transport layer. Today runs are point-in-time (poll/refresh).
- **LO-23 🟠 Live SERP-scraper feeds.**
- **LO-24 🟠 Token-streamed draft rendering.**
- **LO-25 🟡 Agent state-transition choreography** — the "horizontal stepper that
  flows" with per-state look/feel and anti-flicker timing. Only a basic
  `LiveStatus` (refresh-while-running) exists.

## F. Integrations

- **LO-26 🟠 GA4 integration.** The `ga4` kind and `ga4PropertyId` field exist
  and are stored, but there is **no GA4 client** — no sessions/conversions data.
- **LO-27 🟠 Rank-tracking data source.** Performance Tracking was originally
  scoped as "GSC **+ GA4 + rank**"; only GSC was built.
- **LO-28 🟢 Slack integration.** `slack` kind exists; no client.
- **LO-29 🔑 GSC is built but inert + thin.** (a) Needs operator secrets to
  activate — see LO-37/LO-38. (b) Only the URL-prefix property
  (`site.domain`) is used; domain properties (`sc-domain:…`) and the stored
  `gscPropertyId` are **not** wired, and there's no property picker. (c) Only the
  aggregate total is pulled — no per-page / per-query breakdown.
- **LO-30 🟠 Publish-target integrations.** WordPress / Shopify / Webflow / Ghost
  / Vercel kinds exist as raw JSON config rows, but there are **no publish
  clients** behind them.

## G. Scheduling / cron

- **LO-31 🌐 `vercel.json` has no `crons` array.** The cron *routes* exist
  (`/api/cron/performance`, `/api/cron/digest`, the weekly jobs-purge, login
  alerts) but nothing in-repo schedules them. Unless they're configured in the
  Vercel **dashboard** (unverified), none auto-run — so the **daily GSC pull,
  Telegram digest, job purge, and login-attempt alerts do not fire on their
  own.** (Note: `GAPS_REPORT.md` F-010 / F-027 describe these as "fixed via
  cron" — the handler code exists, the *schedule* is the gap.)
- **LO-32 🟡 Target snapshots are opportunistic, not scheduled.** History is
  captured (debounced 6h) only when the dashboard/targets page is loaded;
  unvisited days leave gaps. A real daily snapshot cron was explicitly left as
  "future hardening."

## H. Target Control Panel — remaining from the brainstorm spec

- **LO-33 🟡 Confidence band** on the trajectory (spec asked for it).
- **LO-34 🟢 Explicit "intervention point" markers** on the trajectory.
- **LO-35 🟢 Sparkline on the dashboard.** Only the `/targets` cards draw the
  sparkline; the dashboard OBJECTIVES mini-rows don't.
- **LO-36 🟡 Campaigns / clusters.** The design's multi-target campaign + keyword
  cluster model isn't built; targets are flat per-site. `decrease`-direction and
  non-score metrics are supported but lightly exercised.

## I. Infrastructure / deployment / secrets (mostly operator-only)

- **LO-37 🔑 `CONNECTION_ENCRYPTION_KEY` not set in Vercel.** Required to
  encrypt/decrypt any integration config (incl. the GSC refresh token). I could
  not set it from agent mode (`vercel env add` hangs). Until you add it, GSC and
  all encrypted integrations stay inert (they degrade gracefully).
- **LO-38 🔑 `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` not set.**
  Plus the Google Cloud OAuth app + Search Console API + redirect URI must be
  created by you. (Steps are in `.env.example`.)
- **LO-39 🔑 Google *sign-in* (login) not configured.** Separate from GSC: the
  NextAuth Google provider needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  (note the different env-var names from GSC). Login is username/password only;
  a half-built Google-login path is referenced in the Telegram bot copy.
- **LO-40 🌐 Worker host status unverified.** The browser worker (Railway/Fly)
  and its `GEMINI_API_KEY` / `WORKER_SHARED_SECRET` / `UTEONT_API_BASE` env were
  not checked this session (see LO-03).
- **LO-41 🟡 Migration-journal drift risk.** Migrations 0005 / 0006 / 0007 were
  applied **directly** to live Neon (raw SQL), not via `drizzle-kit migrate`, so
  the DB's `__drizzle_migrations` journal may not list them. Don't run
  `db:migrate` blind. (Related: `GAPS_REPORT.md` F-034.)
- **LO-42 🟡 `AUTH_SECRET` only in production** (preview/dev lack it — team
  sensitive-vars policy). `GAPS_REPORT.md` F-017.
- **LO-43 🌐 Vercel env management blocked from agent mode.** `vercel env add`
  hangs and the REST token returns 403, so **every** env change must be done by
  you in the Vercel dashboard.

## J. UI / UX stubs

- **LO-44 🟡 `/settings` is a placeholder** ("Configuration UI lands once each
  subsystem is wired").
- **LO-45 🟡 Non-GSC integrations are raw-JSON only.** No per-kind form, no
  validation, no "Test connection," `status` is cosmetic.
- **LO-46 🟢 No account/property pickers** for GSC/GA4 (you get whatever the
  default property maps to).
- **LO-47 🟢 Export page** marks unimplemented agents "— coming soon."

## K. Security / ops still-open (see `GAPS_REPORT.md` — not duplicated)

The authoritative security backlog is `GAPS_REPORT.md`. Still-open / owed items
noted there at last update:

- **LO-48** F-032 — gitleaks runs in CI only, no pre-commit hook.
- **LO-49** F-033 — no `CONTRIBUTING.md` redaction checklist (process control).
- **LO-50** F-026 — first Neon backup-restore drill still owed.
- (Plus verify the F-009…F-020 bodies, which still read "OPEN" even though the
  resolution log marks them fixed in `604e7d0` — the index/body are out of sync
  by the file's append-only policy.)

## L. Testing / quality

- **LO-51 🟠 No end-to-end tests.** Only unit + live-DB service tests (116 of
  them). No Playwright E2E for the login → dashboard → sign-out flow
  (`GAPS_REPORT.md` F-021 scaffolded unit tests only).
- **LO-52 🟡 Live-DB tests hit the shared production Neon** and are occasionally
  slow/flaky under load (they use random keys + clean up, but they're not
  hermetic).
- **LO-53 🟠 The vitest suite does not run in CI.** Confirmed: the only project
  workflow is `.github/workflows/secrets-scan.yml` (gitleaks). Tests + tsc +
  lint + build run only locally before each push — nothing enforces them on
  GitHub, so a green build depends on operator discipline.

---

## M. Session update — 2026-05-31 (post-compaction additions)

> **What changed.** Between the original ledger above and this addendum, a new
> session built the **Director Agent (P1)** end-to-end, a third-party audit
> (`docs/AUDIT_2026-05-29.md`) shipped with 18 findings + 3 operator follow-ups,
> a vision conversation locked the **Critic / Tactics Scraper / NotebookLM**
> roadmap, and a `/claude-code-setup` review produced a recommended automations
> bundle. The new items live here so the LO-numbering above stays stable.

### M.1 · Director Agent — newly built + post-P1 hardening (audit A-07)

- **LO-54 🟠 P1 Director Agent verification smoke test — INFLIGHT.** Tables /
  service / route / chat UI / Telegram routing / job-completion loop all shipped
  at commit `f23dd8f`; migration `0003_lumpy_scorpion.sql` applied; Vercel has
  `GEMINI_API_KEY`. Awaiting one free-form Telegram message to `@uteont_bot` →
  expected: ~3–6 s reply, intent-classified, 1 conversations row + 2 messages
  rows in Neon. Blocks LO-55…LO-58.
- **LO-55 🔴 Per-execute-batch approval (audit A-07).** P1 sets
  `planApproved=true` permanently after first approval; every subsequent
  `intent:"execute"` dispatches jobs with no re-gate. Indirect prompt-injection
  surface. Acceptance: approval becomes per-batch (or per-new-goal), not
  per-conversation.
- **LO-56 🟠 Fence job results as UNTRUSTED DATA in transcript.**
  `runDirectorReport` re-feeds raw job output (incl. open-web content) into the
  planner. Wrap in `<UNTRUSTED-DATA agent="research" job="123">…</UNTRUSTED-DATA>`;
  update system prompt to refuse instructions inside fences; adversarial-fixture
  test.
- **LO-57 🟢 Cap injected job-result content length (~4 KB).** Full result stays
  in `runs.result_json` for human review; only a digest enters the planner.
- **LO-58 🟠 Outreach domain allowlist.** `outreach` jobs reject targets not in
  `kv_settings.outreach_domain_allowlist`; managed via `/settings`. Caps blast
  radius if A-07 ever fires.

### M.2 · New agents — locked-decision specs not yet built

- **LO-59 🔴 Critic Agent (#12).** Single-purpose terminal-output reviewer.
  `critiques` table (`agentKey, jobId, runId, endGoal, verdict 'serves'|'fails',
  recommendation, iteration, strictness, createdAt`). Runs ONLY on research
  keywords / ideas / drafts / meta / outreach (NOT decomposition, NOT
  telemetry). Binary contract: `serves` → ship; `fails` → return one
  recommendation; cap iteration at 3 then ship-with-warning. Quota-aware (skip
  when daily Gemini budget < 10%).
- **LO-60 🟠 Critic strictness toggle in `/settings`.** Loose / Standard /
  Pedantic 3-way control; persisted to `kv_settings.critic_strictness`; default
  Standard. Operator can flip per-mood/budget.
- **LO-61 🔴 Tactics Scraper Agent (#13).** `tactics` table (`sourceUrl,
  sourceType 'reddit'|'hn'|'forum'|'blog'|'x'|'other', title, body, tags, score,
  scrapedAt, addedBy`). Default 6 sources: r/SEO, r/bigseo, r/marketing,
  r/TechSEO, Hacker News, Google Webmaster Help. Worker module uses PRAW for
  Reddit, lightweight HTML for forums/blogs, no paid APIs. Other agents query
  during planning (Director read access; Idea Gen + Content Writing reference
  during prompts).
- **LO-62 🟠 `/tactics` page with paste-source input.** Accepts arbitrary URL
  (Reddit subreddit, X account/post URL, blog, forum, etc.) + "Run scrape"
  button. Table view filtered by source/tag. Explicit user requirement from the
  vision message.
- **LO-63 🔴 NotebookLM controller (`worker/browser_automation/notebooklm_controller.py`).**
  Repurposes the existing AI Studio Playwright infrastructure. Accepts video /
  podcast / Reel URL → uploads to NotebookLM → captures tactic-extraction
  summary → ingests into the same `tactics` table with
  `sourceType='notebooklm-derived'`. **Explicit constraint:** zero Gemini API
  calls on this path — entire video understanding done in the NotebookLM browser
  session to preserve API quota.

### M.3 · Director-surface UX gaps

- **LO-64 🟢 Director conversation list pagination.** `src/app/chat/page.tsx`
  loads `limit=50` with no pagination. Add infinite scroll or load-more +
  archive action.
- **LO-65 🟢 Conversation rename + soft-delete actions.** `conversations.title`
  field exists but no UI to set it; default `null` renders "Untitled". Add
  double-click rename + status='archived' soft-delete.
- **LO-66 🟠 Telegram inline keyboard for plan approval.** Currently when the
  Director returns `intent:"propose"` over Telegram, the user must type a
  free-text "go" / "approve" — fragile. Add inline keyboard `[Approve]
  [Reject] [Edit]` whose callback flips `planApproved` and dispatches (or
  persists a reject reason). Important since LO-55 makes approval a per-batch
  act.

### M.4 · Existing-agent TS ports owed (from README matrix)

- **LO-67 🟢 QA agent TS port.** README marks ✅ but notes "Python; TS port
  planned." Acceptance: `src/lib/agents/qa.ts`, callable inline in a Vercel
  function (no worker dependency); existing Python remains for parity until
  switchover.
- **LO-68 🟢 SEO Optimization agent TS port.** Same as LO-67 but for
  `src/lib/agents/seo-optimization.ts`.

### M.5 · Other surface gaps surfaced this session

- **LO-69 🟢 `/articles` browse page.** `articles` table exists, populated by
  Content Writing agent, but no top-level UI. Add table + per-article detail
  page with body preview.
- **LO-70 🟢 `/cycles` management UI.** `cycles` table referenced across schema
  (keywords / ideas / articles / jobs / runs all carry `cycleId`); API exists;
  no top-level UI. Add list + create + cycle-detail timeline.

### M.6 · `docs/AUDIT_2026-05-29.md` operator follow-ups (config, not code)

- **LO-71 🔑 A-16 · Worker `WORKER_HEALTH_HOST` decision.** Audit moved the
  worker health server's default bind to `127.0.0.1`. If Railway's external
  health probe must reach it, set `WORKER_HEALTH_HOST=0.0.0.0` on the worker
  host. Otherwise leave as default.
- **LO-72 🔑 A-02 · Confirm crons appear in Vercel dashboard.** `vercel.json`
  now has the `crons` array (digest Mon 09:00, performance daily 06:00); verify
  both show up under Vercel → Project → Settings → Crons after deploy. Closes
  the verification leg of LO-31.
- **LO-73 🔑 A-06 · Smoke-test deployed nonce-CSP.** Local was clean; nonce-CSP
  failures only surface at runtime. Load deployed app, watch DevTools console
  for CSP violations under normal navigation.

### M.7 · Claude Code automation recommendations (from `/claude-code-setup` this session)

- **LO-74 🟢 Neon MCP install** — `claude mcp add neon`. Prevents next F-034
  silent-drift incident: direct `information_schema` queries from Claude
  without the `/api/db-status` curl detour.
- **LO-75 🟢 GitHub MCP install** — `claude mcp add github` (requires `gh` CLI
  auth). Triage Secret Scanning alerts + CI runs from chat.
- **LO-76 🟢 `add-agent` skill** — `.claude/skills/add-agent/SKILL.md` with
  `disable-model-invocation: true`. Scaffolds new agent across registry /
  worker module / `completeJob` branch / sidebar — the established multi-file
  pattern that will repeat for LO-59, LO-61, LO-67, LO-68 at minimum.
- **LO-77 🟢 `verify-migration` skill.** Runs `db:migrate` then hits
  `/api/db-status` to prove every expected table exists; fails loud on drift.
  Replaces ad-hoc verification.
- **LO-78 🟡 PreToolUse hook: block edits to `.env*` and applied
  `drizzle/00\d\d_*.sql`.** Two protections in one — prevents F-031-style
  secret leak via doc edit AND prevents silent rewrites of applied migrations
  (which desync the journal).
- **LO-79 🟢 PostToolUse hook: ESLint on `src/**/*.{ts,tsx}` edits.** Next 16
  breaking-change feedback at edit time (per `AGENTS.md` warning); on-edit
  `npx eslint --fix "$file"`.
- **LO-80 🟢 `prompt-reviewer` subagent** — `.claude/agents/prompt-reviewer.md`
  (read-only tools). Audits Director / Critic / future agent prompts for
  hedging, JSON-schema divergence, prompt-injection vulnerabilities (esp. the
  Telegram free-form path).
- **LO-81 🟡 `secret-leak-scanner` subagent.** Complements LO-48 (F-032) with
  custom shapes specific to this codebase (Telegram bot tokens
  `\d+:[A-Za-z0-9_-]{35}`, Gemini keys `AIza[A-Za-z0-9_-]{35}`, NextAuth
  secrets, bcrypt hashes in test fixtures). Runs pre-commit.

### M.8 · Session-root correction (right now)

- **LO-82 🔑 Switch active Claude Code session to uteont root.** Today's session
  is rooted at `C:\Users\acer\.claude\projects\DNA App\` (status-bar chip shows
  `dna-app main +14 -4`) even though every uteont file is reachable via absolute
  path. The new uteont-rooted CLI is already running (per user's first
  screenshot) — abandon this DNA-App-rooted conversation and continue work in
  the new window so `git` / `npm` / `db:migrate` run against the correct repo.
  Blocks **everything else** in this list because the wrong cwd silently
  redirects mutating commands.

---

## Quick triage — if you want to keep building, highest-leverage next steps

1. **Activate what's already built (🔑, ~30 min, yours to do):** set
   `CONNECTION_ENCRYPTION_KEY` + the two `GOOGLE_OAUTH_*` vars in Vercel and
   connect GSC (LO-29/37/38). This lights up real traffic data with zero new code.
2. **Schedule the crons (LO-31/32):** add a `crons` array to `vercel.json` so the
   daily GSC pull + snapshots + digest actually run. Small, unblocks real history.
3. **A fourth credential-free agent** (e.g. a keyword/SERP-lite analyzer) — same
   proven pattern as the three audits, no secrets.
4. **Streaming agent logs (LO-22):** the most-requested trust/UX upgrade.
5. **The real SEO engine (§B):** the largest, highest-value, multi-increment
   effort — information-gain + SERP reverse-engineering is the actual moat.

---

*This file is a living backlog. It is safe to edit/commit; it is **not**
`GAPS_REPORT.md` (which stays human-controlled and security-focused).*
