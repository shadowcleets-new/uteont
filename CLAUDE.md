@AGENTS.md

# UTEONT — Build Rules

## Stack reality

Next.js 16 (App Router, RSC by default) · React 19 · TypeScript · Tailwind v4 · **Drizzle ORM against Neon Postgres** (not raw Supabase migrations — translate any runbook step that says `supabase/migrations/...` to `drizzle/<seq>_<slug>.sql`) · NextAuth v5 beta · `zod` v4 · Vitest · `@base-ui/react` + `shadcn` for primitives · `lucide-react` for icons.

API routes are App Router (`src/app/api/<path>/route.ts` with named `GET`/`POST`/`PATCH`/`DELETE` exports) — there is no Express layer. A separate Python + Playwright worker (`worker/`) polls the `jobs` table for browser-driven agents.

## Build & test commands

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` (http://localhost:3000) |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| All tests | `npm run test` |
| Single test | `npm run test <filepath>` |
| Watch tests | `npm run test:watch` |
| DB schema diff → SQL | `npm run db:generate` |
| Apply migrations (dev) | `npm run db:push` |
| Apply migrations (prod) | `npm run db:migrate` |
| DB studio | `npm run db:studio` |

After any schema change: `npm run db:migrate`, then `curl http://localhost:3000/api/db-status | jq` and confirm `tablesMissing` is empty before claiming done.

## Blueprints (read before refactoring)

- [`prompts/implementation_plan.md`](prompts/implementation_plan.md) — 7-phase architectural plan with dependency-flow matrix.
- [`prompts/claude_code_execution_runbook.md`](prompts/claude_code_execution_runbook.md) — step-by-step Milestones 1-10 with target files and verification.
- [`docs/superpowers/specs/2026-05-28-site-context-foundation-design.md`](docs/superpowers/specs/2026-05-28-site-context-foundation-design.md) — active sites/integrations spec (foundation for Milestone 2+).
- [`GAPS_REPORT.md`](GAPS_REPORT.md) — known gaps F-001 through F-037; check before claiming something is "missing".

## Subagent profiles ( `.claude/agents/` )

Three role-specific subagents are configured. Delegate to them rather than reasoning across all three lenses simultaneously:

- [`agentic-architect`](.claude/agents/agentic-architect.md) — Drizzle schema, migrations, state-machine orchestration, Director prompt plumbing, API route design. Owns the backend half of every milestone.
- [`ux-engineer`](.claude/agents/ux-engineer.md) — sidebar, dashboards, approvals drawer, chat, target tooltips, pipeline stepper, runs timeline. Owns the visual half.
- [`feedback-engineer`](.claude/agents/feedback-engineer.md) — `keyword_exclusions` schema, semantic filtering, negative-prompt injection. Owns Phase 7 / Milestone 10.

The main loop coordinates; the subagents execute. Don't duplicate their work inline.

## Strict multi-agent flow

The autonomous writing engine is a single sequential background pipeline (Director → Research/Ideation → Writing Engine → QA → SEO → Approvals). There is **no human intervention** between research, brief, drafting, and QA — only at the Approvals gate and at explicit Director steering points. Do not surface intermediate UI agent tabs for the Writing Engine substeps.

## Styling philosophy

High-density Linear / Stripe / Vercel-inspired layouts. Keep horizontal viewport space clean. Support collapsible sidebars (`w-64` ↔ `w-16` with `transition-all duration-300 ease-in-out`). Persist UI state (`ui.sidebarCollapsed`, `ui.activeSiteId`) in `localStorage` and restore before paint to avoid CLS.

Brand tokens live in `src/lib/theme.ts` — use them, do not invent colors. Type scale: `13px` body, `10px` uppercase section heads (`tracking-wider text-[#9a988e]`), `20-28px` page titles (`tracking-tight`). Inter for UI, Poppins for big stat numbers.

Server Components by default. Mark `"use client"` only when you need state, refs, browser APIs, or event handlers.

## Database rule

Migrations to tables that reference `sites.id` must include `ON DELETE CASCADE`. The `integrations` table (and any per-site connection table) must have a composite unique index on the site-scoped uniqueness key — at minimum `(site_id, kind)` to prevent duplicate channels, and `(site_id, LOWER(phrase))` for `keyword_exclusions` so case variants collapse.

Drizzle workflow: edit `src/lib/db/schema.ts` → `npm run db:generate` → hand-edit the generated SQL in `drizzle/<seq>_<slug>.sql` (rename from drizzle-kit's auto-name) → `npm run db:migrate`. Update the expected-tables list in `src/app/api/db-status/route.ts` whenever the table count changes.

## Milestone gating

Execute the 10-milestone runbook in order. Do not start Milestone N+1 until Milestone N is implemented, compiled (`npm run build`), tested (`npm run test`), and verified per its Step-3 manual check. Each task in the foundation plan (`docs/superpowers/plans/...`) ends with a commit — use the commit messages verbatim. Conventional-commit prefixes: `feat(db|api|services|ui|chat|crypto): ...`.

## Hard rules

- **No paid APIs.** Free tools only — pytrends, Wikipedia, PRAW, GSC. The worker's Gemini calls are exempt; do not introduce new paid LLM/embedding calls without explicit approval.
- **Gemini temperature locked at 1.0.** Per Gemini 3 guidance. Do not lower.
- **Boundary validation only.** `zod.safeParse` at the route handler. Trust the service layer. No defensive `if (!input)` sprinkled through internals.
- **Typed errors, not silent failures.** `SiteKeyTakenError`, `ExclusionAlreadyExistsError`, etc. Never log-and-return-undefined.
- **TDD for pure-function modules** (encryption, prompt builders, exclusion filters). Failing test first, then implementation.
- **One concept per migration.** Don't bundle unrelated DDL.

## Next.js 16 reminder

The `AGENTS.md` warning above is load-bearing — this is not the Next.js you know. Before using a framework API (route handlers, server actions, middleware, caching headers, params), read the corresponding doc in `node_modules/next/dist/docs/`. Heed deprecation notices.
