# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
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
