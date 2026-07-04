# Chronos Changelog

> Structured session journal. Keep the last 15 entries here; archive older
> ones under `.claude/history/`.

## [2026-07-04 13:05:00] - Session 018ZchjhA68 (Phase 2 goal plans + CI red fix)
### 1. Intent, Roles, & Context
- **The Problem:** (a) Phase 2 — Director turns a goal into a frozen numbered
  plan; one approval; autonomous execution pausing only at content gates with
  auto-resume; (b) owner flooded with per-push build-failure emails.
- **Specialist Personas Invoked:** Agent-platform architect; Release engineer
  (CI forensics); App Router engineer.
- **The Strategy:** plans table (JSONB frozen steps) + event-driven plan-driver
  hooked into applyJobResult/failJob/decideCheckpoint; deterministic no-model
  approval turn (injection-window closed). CI red = 2 pre-existing lint ERRORS
  failing `verify` on every push (+ husky prepare killing non-git builds).
### 2. Surgical Technical Modifications
- **Phase 2 (branch feat/director-goal-plans):** schema.ts plans table (pushed
  live, additive); plan-types.ts (zod PlanStep); plans.ts (lifecycle);
  plan-driver.ts (dispatch/advance/gate-resume/retry; content fan-out cap 5;
  qa/seo inline); hooks in jobs.ts (+isGatedAgentKey, persistIdeas runId),
  checkpoints.ts; director.ts (PLANNING prompt, plan schema, draft persistence,
  deterministic approval, qa/seo direct-dispatch bug fixed); /plan page +
  sidebar + dashboard step-N-of-M line.
- **Fixes:** package.json prepare no-ops outside git; worker-health prefer-const;
  error.tsx deliberate <a> (rule disabled with reason).
### 3. Verification & Validation
- tsc clean · lint 0 errors · vitest 501/501 · build exit 0. Driver lifecycle
  proven by live-DB test (advance→gate→approve-resume→complete; reject cancels).
- **Next Sprint Phase:** merge+deploy; Railway service audit (needs
  `railway login`); Phase 3 (Telegram gate pings with step N/M context).

## [2026-07-01 18:05:00] - Session 018ZchjhA68 (deploy unblock + Phase 1 site switcher)
### 1. Intent, Roles, & Context
- **The Problem:** (a) Production deploys silently frozen since Jun 21; (b) owner
  asked why the active goal never progresses; (c) Phase 1 of the autonomy
  roadmap: make the site switcher truly global (consistent scoping, dashboard
  placement, Director locked to it).
- **Specialist Personas Invoked:** Release Engineer (deploy forensics); Systems
  Analyst (goal-stall diagnosis, 3-subsystem multi-agent audit); Relational DB
  Architect (ideas.site_id migration); App Router engineer.
- **The Strategy:** Root-cause first (Hobby cron limit was rejecting every
  deploy pre-build → zero deployment records); replace the 10-min watchdog with
  a free GitHub Actions pinger; then spec→plan→TDD the site-switcher phase on a
  feature branch with owner gates at every prod-DB step.

### 2. Surgical Technical Modifications
- **Deploy fix (on main, deployed):** `vercel.json` (worker-health cron removed);
  `.github/workflows/worker-health-ping.yml` (new, 10-min ping w/ CRON_SECRET);
  `.vercelignore` (new). CRON_SECRET rotated in Vercel (was a reused sk_live key).
- **Phase 1 branch `feat/site-switcher-global` (`8937a59..a9f4250`):**
  - `src/lib/services/app-settings.ts`: +ACTIVE_SITE_KEY, getActiveSiteId(),
    setActiveSiteId() — 9 duplicated resolvers across pages/actions/APIs replaced.
  - `src/app/{runs,articles,ideas}/page.tsx`, `src/app/pipeline/page.tsx`:
    site-scoped queries + shared `src/components/pick-a-site.tsx`.
  - `src/lib/db/schema.ts`: ideas.site_id integer NOT NULL → sites.id + ideas_site_idx.
  - `src/lib/services/jobs.ts`: persistIdeas(siteId,…) stamps site on insert.
  - `src/app/api/cron/performance/route.ts`: iterates ALL non-archived sites.
  - `src/lib/hooks/use-active-site.ts`: router.refresh() on switch;
    `src/app/page.tsx`: dashboard `<SiteSelector/>`.
  - `src/app/api/director/message/route.ts` + `src/app/chat/chat-view.tsx`:
    Director bound to global active site; per-conversation override deleted.
- **Irreversible Actions:** live Neon — ideas.site_id added + NOT NULL (owner-
  authorized db:push --force ×2); 6 orphan test ideas DELETED (owner decision).

### 3. Verification & Validation
- **Execution Commands & Diagnostics:** tsc clean; vitest 497/497 (1 transient
  live-DB flake passed on rerun); next build exit 0; straggler grep clean;
  backfill script printed 0 remaining NULLs before tighten.
- **Resulting App State:** prod (uteont.vercel.app) live on `de10a27`; Phase 1
  awaiting merge decision. Diagnosis: pipeline has no autonomous dispatcher —
  drives Phases 2–3.
- **Next Sprint Phase:** merge/deploy Phase 1; wake Railway worker + GitHub
  CRON_SECRET; spec Phase 2 (Director goal→plan) & Phase 3 (autonomous driver
  + Telegram approvals).

## [2026-06-13 15:45:00] - Session quirky-raman-4a890e (design completion — full)
### 1. Intent, Roles, & Context
- **The Problem:** Complete EVERY remaining item from the 3 parked docs — not
  just the high-value subset — then run the adversarial review and close all
  findings; logic first, UI last; design doc updated.
- **Specialist Personas Invoked:** Principal Security Auditor; Agent-Platform
  Architect; Control-Systems Engineer (reopt loop); CXO/UX; Release Engineer.
- **The Strategy:** Pick up where the first pass stopped. Run the review fleet
  (15 findings), fix all. Then build the remaining backlog in dependency order,
  each TDD'd on pure logic + build-verified, committing per feature.

### 2. Surgical Technical Modifications
- **27 commits** on `feature/design-completion`. New this pass beyond the
  earlier subset: all 15 adversarial-review fixes (2 SSRF redirect/rebind,
  failJob TOCTOU, critic cache-replay + fn-runtime wiring, NotebookLM silent
  failure, CSRF absent-headers, allowlist TLD, guard regexes, length-safe
  compare, L3 partial-batch surfacing); /cycles (LO-70); counterfactual ghost
  (LO-15); closed-loop reopt trigger (LO-11); campaigns + clusters (LO-36,
  migration 0013); telegram inline approval (LO-66); diff-review + undo
  (LO-17/18); analytics top-pages + Critic-on-Runs + dispatch-boundary outreach
  allowlist; quiet-by-default attention (LO-21).
- **Irreversible Actions:** none — migrations 0012 + 0013 staged idempotent,
  not applied.

### 3. Verification & Validation
- **Commands:** 93 pure unit tests (vitest) green; `tsc --noEmit`, `eslint`,
  `next build`, `py_compile` all green. Adversarial review fleet (14 agents)
  completed; every confirmed finding fixed.
- **Resulting App State:** trunk-ready; new worker agents + credential-gated
  integrations inert until operator sets secrets / worker host.
- **Next Sprint Phase:** squash-merge; apply 0012/0013; then the embedding/SERP
  intelligence engine (the remaining moat, design §0.3).

## [2026-06-13 08:50:00] - Session quirky-raman-4a890e (design completion — phase 1)
### 1. Intent, Roles, & Context
- **The Problem:** Add everything from the 3 parked docs (design, backlog,
  audit) to the project — update stale code to current main, build the
  left-out features naturally, update the design doc, then a UI/UX pass last.
- **Specialist Personas Invoked:** Principal Security Auditor; Agent-Platform
  Architect; Worker/Playwright Engineer; Release Engineer; CXO/UX for the pass.
- **The Strategy:** Verify all 3 docs against current main first (workflow
  fleet), then build in dependency order — security fixes → new agents →
  director hardening → automations → doc → UI — each TDD'd on pure logic and
  build-verified (DB unreachable, so no live-DB tests).

### 2. Surgical Technical Modifications
- **Branch:** `feature/design-completion` (13 commits off `main` 1c8c097).
- **Security:** ported audit A-01..A-17 onto main (callback authz, idempotent
  job completion + worker restructure, IP-keyed lockout, constant-time edge-safe
  compares, CSRF Origin check, token hashing, generic errors, body caps, CSP).
- **New agents:** Critic (#15) + critiques table; Tactics Scraper (#16) +
  NotebookLM controller + tactics table; migration 0012 (idempotent, staged).
- **Director:** per-batch approval (A-07/LO-55), outreach allowlist (LO-58),
  autonomy L1–L4 (LO-20), tactics-grounded planning.
- **Also:** live QA/SEO mode (LO-04), per-page GSC (LO-29c), Claude Code
  automations (LO-74..81), settings controls + /tactics page + reduced-motion,
  design-doc §0 reality section.
- **Irreversible Actions:** none — migration 0012 staged, not applied.

### 3. Verification & Validation
- **Commands:** 88 new pure unit tests (vitest) green; `tsc --noEmit`, `eslint`,
  `next build` all green across every commit. `python -m py_compile` on the
  worker modules. Inline self-review fixed 2 real bugs (L1 downgrade loop;
  worker job-stranding).
- **Resulting App State:** trunk-ready; new features inert where they need
  operator secrets / the worker host; everything else live on merge.
- **Next Sprint Phase:** re-run the adversarial-review fleet (rate-limited),
  apply 0012 to Neon, squash-merge.
## [2026-06-14 15:25:00] - Session thirsty-satoshi-0601ab (IMPROVEMENT_PLAN: moat + foundations)
### 1. Intent, Roles, & Context
- **The Problem:** Execute the holistic IMPROVEMENT_PLAN. A prior workflow
  produced the TS pure-cores but left 2 Python impls missing, nothing wired,
  and no gate run. Consolidate it into a verified, committed increment.
- **Specialist Personas Invoked:** SEO Intelligence Architect; Enterprise DB
  Architect (additive idempotent migrations); QA/Verification Lead;
  Python resilience engineer.
- **The Strategy:** Finish the orphaned cores, get every layer green
  (tsc/eslint/vitest/build + py_compile/py tests), then wire the cores into
  live surfaces (daily cron, jobs lifecycle, a new page) without breaking the
  build, and commit in logical units.

### 2. Surgical Technical Modifications
- **New tables + idempotent migrations (0012–0014):** metrics_timeseries
  (IP-10), job_events (IP-13), publish_receipts (IP-07); registered in
  `verify-migration.mjs` EXPECTED.
- **New pure cores (TS, tested):** information-gain (IP-04), cannibalization
  (IP-42), reopt-triggers (IP-06), metrics-timeseries (IP-10), job-events
  (IP-13), publishing (IP-07), cost-ledger (IP-14), flags (IP-36), redact-pii
  (IP-65), content-safety (IP-90).
- **New worker cores (Python, tested):** lib/fetcher.py (IP-15, written),
  semantic_agent/profile.py (IP-03, written), trends_agent/scoring.py (IP-01),
  serp_agent/parse.py (IP-02).
- **Wiring:** `cron/daily` now stores GSC/GA4 metrics as a time series +
  runs the cannibalization scan; `jobs.ts` emits job_events on every
  transition; `gsc.ts` gains a per-(page,query) fetcher; new `/cannibalization`
  page + sidebar link.
- **Irreversible Actions:** none. Migrations are additive (IF NOT EXISTS),
  NOT applied (operator-gated per F-034). No push/deploy performed.

### 3. Verification & Validation
- **Commands:** `npx tsc --noEmit` (clean) · `npx vitest run`
  (336 passing / +99 new; the 25 fails are the pre-existing live-DB suites
  on unset DATABASE_URL — IP-33's scope, unchanged) · `npx eslint`
  (0 errors, 2 cosmetic warnings) · `next build` (success, /cannibalization
  rendered) · all `worker/**/*_test.py` pass + `py_compile` clean.
- **Resulting App State:** every new DB read is defensive — missing
  (unapplied) tables degrade to empty, never crash.
- **Next Sprint Phase:** operator applies migrations 0012–0014 + deploys;
  then IP-05 (synthesis), IP-17 (SSE), IP-20 (design tokens), IP-32 (E2E).

## [2026-06-12 09:15:00] - Session quirky-raman-4a890e (trunk integration)
### 1. Intent, Roles, & Context
- **The Problem:** Land the completed 8-feature pensive→main port
  (`feature/seo-refactor`, 13 commits) on the trunk and make every safety
  ref durable on origin, per the Git Hygiene protocol.
- **Specialist Personas Invoked:** Release Engineer / Git Custodian;
  QA Verification Lead.
- **The Strategy:** Verify the suite on the branch, squash-merge so `main`
  gains one reviewable commit, prove the merged tree is byte-identical to
  the branch tip, re-run the suite on merged `main`, then push trunk +
  durability refs before retiring the branch and its worktrees.

### 2. Surgical Technical Modifications
- **Modified Files:**
  - `main` ← squash of `feature/seo-refactor` (`3002b76`): all 8 ports
    (exclusions loop, analytics, cost meter, runs console, pipeline,
    approvals split-pane, chat polish, competitors live-crawl), operator
    scripts, and the 5 adversarial-review fixes.
  - `.claude/active_context.md`: rewritten to post-merge state.
  - `CHANGELOG.md`: created (this file).
- **Irreversible Actions:** none destructive — `feature/seo-refactor`
  deleted only after its history was preserved at the pushed tag
  `archive/seo-refactor-port`.
- **Payload/Schema Changes:** migration `0011` (keyword exclusions table)
  now staged on trunk; live Neon already had the table (verified, no DB
  writes performed).

### 3. Verification & Validation
- **Execution Commands & Diagnostics:** `npm test` (vitest) on the branch:
  267/267 across 46 files. `git rev-parse main^{tree}` ==
  `feature/seo-refactor^{tree}` (byte-identical). `npm test` re-run on
  merged `main`: 267/267.
- **Resulting App State:** trunk carries the full Waves+Milestones feature
  set; Analytics degrades honestly to "Modeled" until GSC/GA4/Slack
  secrets (LO-37/38/39) are set by the operator.
- **Next Sprint Phase:** resume the product backlog — LO-59 Critic agent
  or LO-22 polish; operator to judge `wip/root-main-uncommitted`.
