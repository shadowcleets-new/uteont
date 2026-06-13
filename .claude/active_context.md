# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
**Design-completion effort (branch `feature/design-completion`).** The 3 parked
docs (design, backlog, audit) are landed in `docs/`, the audit fixes + the
backlog's net-new features are built, the design doc is reality-corrected, and a
first UI pass shipped. One item outstanding: the adversarial-review fleet
(subagents) is rate-limited until ~03:40 IST — re-run it, then merge.

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
1. Re-run the adversarial review workflow; close any real findings.
2. Apply migration 0012 against Neon (idempotent) + verify-migration.
3. Squash-merge `feature/design-completion` → main; delete branch.
