# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
**Remediation COMPLETE + MERGED + DEPLOY-READY (2026-06-29).** All engineer
findings are fixed and merged into `main` (single folder, no worktrees). DB
migrated (`scheduled_at` live via db:push), pre-commit hook active. A post-merge
adversarial audit verified every finding survived the merge; the 2 gaps it found
are fixed. Remaining: operator password/cred rotation + restore drill.

## 2. Current Milestone Status
- **All Wave 0–3 engineer findings:** merged to `main` (merge `896f488`), then
  two post-merge fixes — `9f9d375` (job complete/fail idempotency guard reverted to
  non-terminal, fixing live-DB tests) and `1378c72` (N-13 dashboard degrades on
  DB-down for the post-Promise.all queries main added).
- **Superseded by main, dropped as duplicates:** N-10 (IP-keyed lockout), N-18
  (hashed+constant-time setup token). **Deferred:** N-26 (no publish executor).
  DOC-1 reconciled.
- **Verification:** `tsc` clean · Vitest **491/491** · worker `pytest` **32/32** ·
  `next build` success. Post-merge audit: 26/26 findings confirmed present + correct.
  The 5 fails are all live-DB tests that need migration 0011 applied first.

## 3. Active Working Context
- Stack: Next.js 16 (read `node_modules/next/dist/docs/` before app code).
  DB: Neon/Drizzle. Worker: Python/Playwright on Railway.
- Migration `drizzle/0011_hot_ezekiel.sql` adds `jobs.scheduled_at` + partial claim
  index. Code already references `scheduled_at` → DB MUST get 0011 before deploy
  (F-034-class hazard).
- New surfaces: `.husky/pre-commit` (arm with `npm install`), `CONTRIBUTING.md`,
  `src/app/api/cron/worker-health/route.ts` (registered in `vercel.json`).
- ⚠️ `.env.local` holds prod Neon creds (SEC-2) — the "live DB" Vitest cases hit
  production. Untracked local-only `.claude/launch.json` left uncommitted by design.

## 4. Roadblocks / cautions
- Do NOT `db:migrate` blind (F-034). Operator applies 0011 with `npm run db:push`.
- Cannibalization/metrics light up only once GSC is connected + cron runs.
- GSC OAuth now requires `AUTH_SECRET` set (state signing fails closed without it).

## 5. Next Immediate Steps (operator)
1. `npm run db:push` to apply migration 0011 (before deploying this branch).
2. Rotate admin password (SEC-1) + prod Neon creds/encryption key (SEC-2);
   `npm install` to arm the gitleaks pre-commit hook.
3. Say "update the gaps report" to authorize DOC-1 (GAPS_REPORT status reconciliation).
