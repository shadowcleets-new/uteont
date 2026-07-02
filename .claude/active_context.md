# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
**Phase 1 (site switcher made truly global) COMPLETE on branch
`feat/site-switcher-global` (2026-07-01) — awaiting owner merge+deploy decision.**
Phases 2 (Director plan-first) and 3 (autonomous driver + Telegram gate
approvals) are designed at a high level but not yet spec'd.

## 2. Current Milestone Status
- **Deployed to prod (Jun 30):** all remediation + Sites bulk-delete are LIVE.
  Root cause of the 9-day silent deploy freeze: Hobby plan rejects the
  10-min worker-health cron → moved to GitHub Actions
  (`.github/workflows/worker-health-ping.yml`, needs repo secret CRON_SECRET —
  rotated 2026-06-30). `vercel.json` keeps only daily+weekly crons.
- **Phase 1 branch (6 commits, `8937a59..a9f4250`):** single `getActiveSiteId()`
  in `app-settings.ts` (all 9 duplicate resolvers replaced); Runs/Articles/
  Pipeline/Ideas pages site-scoped (+ shared `<PickASite/>`); `ideas.site_id`
  added NOT NULL on live Neon (backfilled; 6 orphan test ideas deleted with
  owner OK); performance cron iterates ALL sites (was hardcoded 'default');
  dashboard `<SiteSelector/>` + `router.refresh()` on switch; Director locked
  to the global active site (per-conversation override removed).
- **Verification:** tsc clean · vitest **497/497** · `next build` exit 0 ·
  straggler grep clean (only ACTIVE_SITE_KEY remains).
- **Goal-stall diagnosis (2026-06-30, 3 subsystem reports):** nothing dispatches
  production work autonomously (crons only measure; Director needs a human
  turn; next-action is advice-only); `intelligence_engine` flag defaults OFF so
  ga4 metric pinned at 0; Publishing agent unimplemented; 'myntra' target is an
  infeasible placeholder (metric mismatch). These motivate Phases 2–3.

## 3. Active Working Context
- Stack: Next.js 16 (read `node_modules/next/dist/docs/` first). Neon/Drizzle.
  Python/Playwright worker on Railway (likely asleep — agents idle 25+ days).
- Spec: `docs/specs/2026-07-01-site-switcher-global-design.md`.
  Plan: `docs/plans/2026-07-01-site-switcher-global.md` (all 7 tasks done).
- ⚠️ `.env.local` holds prod Neon creds — live-DB Vitest hits production.
- Vercel CLI installed + logged in (`shadowcleets`); CLI deploys fail on a
  husky prepare step (no .git in upload) — deploy via GitHub push instead.
- Junk dirs (`.vs/`, `.gemini/`, `graphify-out/`, `GEMINI.md`) now gitignored.

## 4. Roadblocks / cautions
- UI toggle ≠ cron scope: background jobs iterate all sites BY DESIGN.
- `db:push` needs `-- --force` in non-TTY shells (prompt can't render);
  review printed statements first. keyword_exclusions unique index drop+recreate
  in the diff is a benign drizzle expression-index quirk.
- Railway worker + `intelligence_engine` flag still block real pipeline output.

## 5. Next Immediate Steps
1. Owner: decide merge of `feat/site-switcher-global` → main + push (deploys).
2. Owner: wake/verify the Railway worker; add CRON_SECRET repo secret on GitHub
   and run the worker-health workflow once (green = watchdog live).
3. Spec Phase 2 (Director goal→plan-first) then Phase 3 (autonomous driver +
   Telegram approvals with step N/M context).
