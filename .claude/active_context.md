# Active Context — UTEONT

> Rolling system memory. Read at the start of every cycle, rewrite at the end.
> Keep ≤100 lines.

## 1. Current Focus
**Trunk integration COMPLETE (2026-06-12).** The 8-feature pensive port is
squash-merged to `main` (`3002b76`) and pushed. Next: resume the product
backlog (LO-59 Critic agent or LO-22 polish).

## 2. Current Milestone Status
- `main` = `origin/main` = `3002b76` "feat: port the Milestones feature set
  onto the Waves trunk" — squash of the 13 `feature/seo-refactor` commits.
  Granular history preserved at tag `archive/seo-refactor-port` (pushed).
- Verified post-merge: 267 tests / 46 files green on merged `main`; merged
  tree byte-identical to branch tip `2f6e883`.
- Durability refs all on origin: `claude/pensive-mayer-71b49f`,
  `archive/pensive-milestones`, `archive/local-main-pre-reset`,
  `archive/seo-refactor-port`.
- `feature/seo-refactor` deleted (local + origin) per git protocol;
  `seo-refactor` + `pensive-mayer-71b49f` worktrees retired.

## 3. Active Working Context
- Stack: Next.js 16 (read `node_modules/next/dist/docs/` before writing code).
  DB: Neon Postgres via Drizzle. Worker: Python/Playwright on Railway.
- Migration `0011` staged in-repo; live Neon already has the table —
  `verify-migration.mjs` confirms the full 22-table schema.

## 4. Roadblocks / cautions
- Do NOT `db:migrate` blind (LO-41 journal-drift risk on live Neon).
- Critic / Tactics Scraper / NotebookLM (LO-59/61/63) still don't exist anywhere.
- 🔑 Operator-only: GSC/GA4/Slack secrets (LO-37/38/39) still unset —
  Analytics shows the "Modeled" fallback until they land.
- `wip/root-main-uncommitted` (`0f4fbd5`, root checkout) still awaits
  operator evaluation.

## 5. Next Immediate Steps
1. Resume the product backlog: LO-59 Critic agent or LO-22 polish.
2. Operator: set GSC/GA4/Slack secrets; judge `wip/root-main-uncommitted`.
