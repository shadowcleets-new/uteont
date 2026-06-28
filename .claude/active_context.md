# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
**Remediation COMPLETE (2026-06-22).** All engineer/Claude findings from
`REMEDIATION_PLAN.md` (Wave 0–3) are fixed, tested, committed on branch
`claude/thirsty-satoshi-0601ab`. Awaiting operator DB/secret actions before
merge/deploy. Branch not pushed.

## 2. Current Milestone Status
- **Wave 0:** N-01/N-03/N-08/N-02/N-07 done. Migration **0011** still to be APPLIED.
- **Wave 1–3 (engineer):** done this session — 7 commits `bcc09bb`→`6466c8b`
  (worker SSRF/robots/poll-loop; jobs backoff+index; Gemini budget + kill switch +
  cron idempotency; login-DoS + GSC OAuth signing + setup-token + telegram allowlist;
  silent-catch logging + SSE caps + redact-pii fail-closed + director prompt +
  job_events retention; worker-health monitoring; gitleaks pre-commit + CONTRIBUTING).
- **Deferred:** N-26 (no publish executor yet); DOC-1 (GAPS_REPORT is operator-controlled).
- **Verification:** `tsc` clean · Vitest 394 pass / 5 fail · worker `pytest` 32 pass.
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
