# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
Port `pensive-mayer`'s unique features onto `main`'s services, on branch
`feature/seo-refactor`, so each lands as natural app flow (not a forced graft).
**Port #1 (keyword exclusions) — DONE** (TDD, 23 new tests, full suite 217/217,
tsc+lint+build clean). Next: port #2, Analytics portal.

## 2. Current Milestone Status
Branch fragmentation has been consolidated (2026-06-11):
- **Trunk = `main` = `origin/main` (`f4b5deb`)** — the "Waves" production line:
  13/14 agents (only `publishing` off), migrations `0000`–`0010`, real GA4 / GSC /
  Slack clients, checkpoint + 5-verb approval machine, decision-records, SSE
  streaming, untrusted fencing, target snapshots/confidence bands.
- **Active branch = `feature/seo-refactor`** (off `main`) — single integration
  branch; squash-merge to `main` when the port is done.
- **Port source = `claude/pensive-mayer-71b49f`** ("Milestones 1–10", LOCAL-ONLY,
  tag `archive/pensive-milestones`). Unique vs main: Analytics portal,
  Competitors workspace, pipeline stepper, Director chat redesign, split-pane
  Approvals UI, closed-loop keyword exclusions, cost meter.
- **Preserved: `wip/root-main-uncommitted` (`0f4fbd5`)** — ~400 lines of
  uncommitted work that was sitting on the old root/main base; evaluate before
  discarding. Tag `archive/local-main-pre-reset` anchors the old base.
- Retired: `worktree-cost-efficiency-hardening` (== main), `affectionate-lovelace`
  (empty dupe). `site-context-foundation` deferred (1 uncommitted file).

Guiding principle: **main has the stronger backend, pensive the stronger UI →
graft pensive's screens onto main's services; never duplicate logic.**

## 3. Active Working Context
- Stack: Next.js 16 (breaking changes — read `node_modules/next/dist/docs/`
  before writing code; see AGENTS.md). DB: Neon Postgres via Drizzle.
- Worker: Python/Playwright (Railway) for `runtime:"worker"` agents
  (research, idea-generation, content-writing, backlink) — needs `GEMINI_API_KEY`.
- Migration collision resolved: main keeps `0004_site_foundation`; pensive's
  `keyword_exclusions` schema becomes a NEW `0011_*` on this branch.
- Worktrees: `git worktree list`. This branch's worktree: `.claude/worktrees/seo-refactor`.

## 4. Roadblocks / cautions
- Do NOT `db:migrate` blind (LO-41 journal-drift risk on live Neon).
- Critic / Tactics Scraper / NotebookLM (LO-59/61/63) do NOT exist on any branch.
- pensive + the archive tags are LOCAL-ONLY — `git push origin --tags` +
  `git push origin claude/pensive-mayer-71b49f` for off-site durability.

## 5. Next Immediate Steps (port order, low→high conflict)
1. **Analytics portal** (`/analytics`) → rewire charts to main's real
   `integrations/ga4.ts` + `gsc.ts`.
2. **Cost meter + target tooltips** → back with main's `gemini-cost.ts`.
3. **Runs console + categorized Settings** → graft UI, keep main's wiring.
   (Then: pipeline stepper, split-pane Approvals, Director redesign,
   Competitors workspace.)

Port #1 shipped (this branch): `keyword_exclusions` table (0011 — already
present in live Neon via the pensive line, verified), exclusion-filter lib
(+ filterKeywordRows ingestion seam), keyword-exclusions service,
capture-on-shelve/release-on-restore in keywords service (single + bulk),
payload.exclusions on research/idea-generation dispatch (pre-dedupe-key),
ingestion-time filter in persistResearchKeywords (rejection trail on the
run), /exclusions page (active-site pattern), API under
/api/sites/[id]/exclusions, sidebar entry.
