# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
**The pensive→main feature port is COMPLETE (all 8 ports, 2026-06-11).**
`feature/seo-refactor` holds the full integration; next step is review +
squash-merge to `main`, then delete the branch per the git protocol.

## 2. Current Milestone Status
Consolidation done: trunk = `main` (= `origin/main`, the "Waves" line).
All unique pensive-mayer ("Milestones") features now live on
`feature/seo-refactor`, grafted onto main's services:

1. **Exclusions** — closed loop: shelve→capture, restore→release, prompt-time
   `payload.exclusions`, deterministic ingestion filter + rejection trail;
   `/exclusions` page; migration `0011` (table already in live Neon, verified).
2. **Analytics** (`/analytics`) — live GSC daily series + top-query rankings
   (new tested by-date/by-query client fns; partial LO-29c close) with honest
   "Modeled" fallback badge when GSC is inert; real articles/day axis.
3. **Cost meter + tooltips** — cost-projection lib (tested) + CostMeter on the
   Content Draft agent page; InfoTooltips on target form fields.
4. **Runs console** — expandable RunCard (timeline, tokens/cost, error console
   + hints); Settings gains read-only MODEL ROUTING card. (pensive's dead-knob
   AgentConfigForm intentionally not ported.)
5. **Pipeline** (`/pipeline`) — six-step stepper derived from observable DB
   state (state machine ported with 9 tests); `/api/pipeline/[cycleId]`.
6. **Approvals** — split-pane workspace on main's checkpoint machine (5 verbs,
   graduated friction, decision notes); payload-aware detail (draft markdown /
   idea list / outreach email); markdown renderer ported with 10 tests.
7. **Chat** — slash commands (/research /audit /status, 7 tests), typing dots,
   smart near-bottom scroll; main's rename/delete/search/memory untouched.
8. **Competitors** (`/competitors`) — UPGRADED from pensive's stub: scan runs
   the REAL Site Crawl agent inline; Directory derives from real scan runs
   (crawl score, failing checks, thin/orphan samples; CSV/JSON export).
+ scripts: `seed-admin.mjs`, `verify-migration.mjs` (full 22-table check).

Tests: started 217 → now 273 (56 new, all TDD red→green). Each port a clean
commit; tsc + eslint + build green at every step.

## 3. Active Working Context
- Stack: Next.js 16 (read `node_modules/next/dist/docs/` before writing code).
  DB: Neon Postgres via Drizzle. Worker: Python/Playwright on Railway.
- Worktree: `.claude/worktrees/seo-refactor`; branch pushed to origin.
- Migration `0011` staged in-repo; live Neon already has the table.

## 4. Roadblocks / cautions
- Do NOT `db:migrate` blind (LO-41 journal-drift risk on live Neon).
- Critic / Tactics Scraper / NotebookLM (LO-59/61/63) still don't exist anywhere.
- pensive + archive tags are LOCAL-ONLY — push for durability:
  `git push origin claude/pensive-mayer-71b49f archive/pensive-milestones archive/local-main-pre-reset`
- `wip/root-main-uncommitted` (`0f4fbd5`) still awaits evaluation.

## 5. Next Immediate Steps
1. Review the full diff (adversarial pass), fix anything real.
2. Squash-merge `feature/seo-refactor` → `main`, push, delete branch + retire
   the pensive worktree (`git worktree remove` first).
3. Resume the product backlog (next: LO-59 Critic agent or LO-22 polish).
