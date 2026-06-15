# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
**Design-completion effort COMPLETE (branch `feature/design-completion`, 27
commits).** All 3 parked docs are landed and acted on: audit A-01..A-17 fixed,
the entire LO backlog's in-repo-buildable items built, the adversarial review
run with all 15 findings closed, the design doc reality-corrected, and the
UI/logic-last pass shipped. Ready to squash-merge to `main`.

## 2. What shipped (13 commits on `feature/design-completion`)
- **Security (audit A-01..A-17):** telegram callback authz + markdown escape,
  keyword-approval run-scoping, idempotent completeJob + failJob guard +
  worker.py complete/fail restructure, IP-keyed login lockout + IP/UA recording,
  edge-safe constant-time secret compares, CSRF Origin check, setup-token
  hashing, generic 500 bodies, worker health bind 127.0.0.1, article body cap,
  CSP drop unsafe-eval (full nonce deferred). A-14 superseded by main.
- **Critic agent (#15, LO-59/60):** critiques table, binary serves/fails,
  iteration cap 3, quota-aware (gemini-budget counter), strictness in settings,
  auto-runs in applyJobResult.
- **Tactics Scraper (#16, LO-61/62) + NotebookLM (LO-63):** worker module
  (Reddit/HN/HTML), notebooklm_controller.py (zero Gemini API), tactics table,
  /tactics page, digest fed into Director planning.
- **Director hardening:** per-batch approval (LO-55/A-07), outreach allowlist
  (LO-58), autonomy levels L1–L4 (LO-20).
- **LO-04** live QA/SEO mode (SSRF-guarded fetch); **LO-29c** per-page GSC.
- **Claude Code automations (LO-74..81):** add-agent + verify-migration skills,
  PreToolUse env/migration guard hook, PostToolUse eslint hook, prompt-reviewer
  + secret-leak-scanner subagents.
- **UI pass:** settings controls (autonomy/strictness/allowlist), /tactics page,
  reduced-motion + motion tokens.
- **Docs:** platform-design.md §0 "Implementation Reality" (corrections + new
  capabilities + honest still-to-build list).
- **Migration 0012** (critiques + tactics) staged idempotent; NOT applied (DB
  unreachable; journal-drift convention).

## 3. Verification posture
- DB is UNREACHABLE in this env (Neon DNS fails) → live-DB tests can't run.
  Verified via: 88 new pure unit tests, `tsc --noEmit`, `eslint`, `next build`
  (all green). A-04 has a live-DB regression test that runs when Neon returns.
- Inline self-review found + fixed 2 real bugs (L1 downgrade loop; worker
  job-stranding on report failure). The 4-dimension adversarial fleet is owed.

## 4. Roadblocks / cautions
- Adversarial review fleet rate-limited until ~03:40 IST — re-run
  `design-completion-review` workflow, fix findings, before merge.
- Do NOT db:migrate blind; apply 0012 directly when Neon returns (idempotent).
- Operator-only: GSC/GA4/Slack secrets; worker host for the new worker agents.
- Deferred (UI-coupled, not built): LO-36 campaigns/clusters, LO-66 telegram
  inline keyboard, LO-11 reoptimization loop, LO-15/17/18/21 (counterfactuals,
  diff-review, undo, cognitive guardrails), the full Mission-Control/dark-mode
  UI rebuild. Catalogued in platform-design.md §0.3.

## 5. Next Immediate Steps
1. Squash-merge `feature/design-completion` → main; delete branch.
2. Apply migrations 0012 + 0013 against Neon (idempotent) + verify-migration.
3. Resume the still-to-build moat: the embedding/SERP intelligence engine and
   the metrics_timeseries substrate (design §0.3).

## 6. Built this session (27 commits)
Security (audit A-01..17) · Critic #15 · Tactics #16 + NotebookLM · director
per-batch approval + autonomy L1-L4 + outreach allowlist · live QA/SEO + per-page
GSC · Claude Code automations · /tactics /cycles /campaigns · counterfactual ghost
· closed-loop reopt trigger · diff-review + undo · quiet-by-default attention ·
telegram inline approval · Critic-on-Runs · reduced-motion. Adversarial review:
15 findings, all closed (2 SSRF, failJob TOCTOU, critic cache-replay, etc.).
Verification: 93 pure tests + tsc + eslint + next build green; DB unreachable so
live-DB tests deferred; migrations 0012/0013 staged (idempotent), not applied.
**IMPROVEMENT_PLAN — moat + foundations landed (2026-06-14).** A verified,
committed increment of the plan's highest-value spine is on
`claude/thirsty-satoshi-0601ab` (5 commits, a23a1ab→b356c13). Not yet pushed;
migrations not yet applied.

## 2. Current Milestone Status
- Implemented + fully gated (tsc/eslint/vitest/build + py tests):
  - Substrate: `metrics_timeseries` (IP-10), `job_events` (IP-13),
    `publish_receipts` (IP-07) — schema + idempotent migrations 0012–0014.
  - Pure TS cores: information-gain (IP-04), cannibalization (IP-42),
    reopt-triggers (IP-06), cost-ledger (IP-14), flags (IP-36), redact-pii
    (IP-65), content-safety (IP-90), publishing decision (IP-07).
  - Python worker cores: fetcher (IP-15), semantic profile (IP-03),
    trend scoring (IP-01), SERP parse (IP-02).
  - Live wiring: daily cron stores GSC/GA4 metrics + cannibalization scan;
    jobs lifecycle → job_events; GSC per-(page,query) fetcher;
    `/cannibalization` page + sidebar.
- Tests: 336 passing. 25 failing = pre-existing live-DB suites (DATABASE_URL
  unset → IP-33's hermetic-DB scope), unchanged from baseline.

## 3. Active Working Context
- Stack: Next.js 16 (read `node_modules/next/dist/docs/` before app code).
  DB: Neon/Drizzle. Worker: Python/Playwright on Railway.
- Cores are pure + defensive: a missing (unapplied) table degrades to empty.
- ⚠️ `node_modules` was wiped mid-session by an external process; restored
  with `npm ci`. Re-run `npm ci` if `@vercel/analytics/next` fails to resolve.

## 4. Roadblocks / cautions
- Do NOT `db:migrate` blind (F-034). Operator applies 0012–0014 directly.
- Cannibalization/metrics light up only once GSC is connected + cron runs.
- GSC/GA4/Slack secrets still operator-only (Analytics shows "Modeled").
- The big engine (IP-01/02 fetch shells, IP-04 wiring into content-brief,
  IP-05/17/20) is still ahead — only the pure cores + substrate exist.

## 5. Next Immediate Steps
1. Operator: apply migrations 0012–0014; push branch + deploy.
2. IP-05 (gap-driven synthesis) + wire IP-04 into the content-brief runner.
3. IP-17 (SSE streaming) and IP-20 (design tokens + dark mode).
