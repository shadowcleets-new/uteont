# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
**Remediation (2026-06-20).** A 7-dimension audit produced `REMEDIATION_PLAN.md`
(36 findings: 2 critical, 7 high). Wave 0 in progress — N-01/N-03/N-08 landed +
verified (tsc clean; jobs-idempotency.test.ts 3/3 + dispatch 2/2 pass). Branch
still not pushed; migrations 0010–0014 still unapplied. Prior: IMPROVEMENT_PLAN
moat+foundations on this branch (a23a1ab→b356c13).

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
1. Wave 0 remainder: N-02/N-07 (regenerate drizzle journal 0010–0014), then
   operator applies migrations + pushes branch.
2. Wave 1: error boundaries (N-04/N-12/N-13/N-20), budget cap + flag gate
   (N-06/N-25), login-DoS (N-10). See REMEDIATION_PLAN.md.
3. Operator: rotate admin password (SEC-1) + point `.env.local` off prod (SEC-2).
