# Site Switcher — Made Truly Global (Phase 1)

- **Date:** 2026-07-01
- **Status:** Draft — awaiting owner review
- **Owner ask:** "In the dashboard I should be able to toggle between sites, and whatever site I select, all the agents, Director, and workers switch their context to that site." Scoped in brainstorming to: (1) make it 100% consistent, (2) surface the switcher on the dashboard, (3) Director always follows the toggle.

## 1. Goal

One global **active site** selection that scopes the **entire** app — every screen, agent, cron, and the Director — to the chosen site, surfaced prominently on the dashboard. Close the gaps where surfaces currently ignore it.

## 2. Non-goals

- **No worker change.** Every job already carries its own `siteId` (`jobs.site_id`, schema.ts:148), so the worker inherently only acts on the selected site's jobs.
- **No per-user active site.** Single-admin app; a single global setting (`kv_settings` key `ui.activeSiteId`) is correct.
- **Not** the autonomous Director / plan-first / Telegram-approval features — those are Phases 2–3.

## 3. Current state (audit)

The active-site setting, its API (`/api/ui/active-site`), the client hook (`useActiveSite`), and the sidebar selector (`site-selector.tsx`) already exist and work.

| Surface | How it resolves "site" today | Status |
|---|---|---|
| Dashboard, Targets, Analytics, Exclusions | inline `kv_settings ui.activeSiteId` query (`getActiveSiteIdServer`) | ✅ correct, but **duplicated** |
| Tactics / Campaigns / Cycles actions | `getKvSetting('ui.activeSiteId')` (some with `listSites()[0]` fallback) | ✅ correct, **inconsistent fallback** |
| Competitors scan, GSC connect | inline `ui.activeSiteId` query | ✅ correct |
| Agent Run button, agent stream, Director chat | `useActiveSite()` (client) | ✅ correct |
| **Ideas page** | filters by `status` only — **no site filter** | ❌ shows all sites; table has **no `site_id`** |
| **Runs page** | filters by `subject` only | ❌ ignores its `runs.site_id` |
| **Articles page** | filters by `status` only | ❌ ignores its `articles.site_id` |
| **Pipeline page** | derives from `cycleId` searchParam | ❌ verify + scope to active site |
| **Performance cron** (`api/cron/performance/route.ts:13`) | hardcoded `getSiteByKey("default")` | ❌ **bug** — wrong site |

Duplication: the "which site am I on?" logic is copy-pasted across ~7 files. Any new screen that forgets it silently breaks.

## 4. Design

### 4.1 Single source of truth
Add one server helper `getActiveSiteId(): Promise<number | null>` (in `src/lib/services/app-settings.ts`) reading `kv_settings.ui.activeSiteId`. Replace all duplicated `getActiveSiteIdServer()` definitions and inline `ui.activeSiteId` queries and `getKvSetting('ui.activeSiteId')` calls with it. New screens call one function; they can't "forget."

**Standardize the empty state:** when there is no active site, return `null` → pages render the existing "pick a site" empty state (as Targets/Analytics/Exclusions already do). Remove the ad-hoc `listSites()[0]` fallback in campaigns/cycles actions so behavior is uniform.

### 4.2 UI vs. background distinction (important)
- **UI surfaces** (pages, Director, agent Run buttons) → scope to the **active-site toggle**.
- **Background crons** (`cron/daily`, `cron/performance`, `cron/digest`) → operate on **all sites**, never the UI toggle (a scheduled job has no UI session). The performance-cron fix is therefore *"iterate all sites"* (matching `cron/daily`), **not** "use the active site." (Note: `cron/performance` is also currently unregistered in `vercel.json` — cross-ref the goal-stall diagnosis; registering/retiring it is out of scope here, only the `"default"` hardcode is fixed.)

### 4.3 Close the gaps
- **Runs / Articles** — add `WHERE site_id = <active>` (both already have the column + a `bySite` index).
- **Pipeline** — verify how it scopes and ensure it filters to the active site.
- **Ideas** — needs a schema change first (§4.4), then filter by site.
- **Performance cron** — replace `getSiteByKey("default")` with a loop over all non-archived sites.

### 4.4 `ideas` schema change (the one prod-affecting step)
`ideas` is the only content table with **no `site_id`** (it links only to `keyword_id` / `cycle_id` / `run_id`, all nullable). To scope it consistently:

1. Add `ideas.site_id integer REFERENCES sites(id)` **nullable**, plus a `bySite` index.
2. **Backfill** existing rows, in preference order: `run_id → runs.site_id`, else `cycle_id → cycles.site_id`, else `keyword_id → keywords.site_id`.
3. Verify zero remaining `NULL`s (handle any orphan ideas explicitly — assign to a chosen site or delete; decide at implementation with the row count in hand).
4. Tighten to `NOT NULL`.
5. Stamp `site_id` on new ideas at insert time (idea-generation persistence).

Applied via `db:push` against the live Neon DB — **walk the owner through it** (non-technical, production data). Reversible (the column can be dropped); backfill is idempotent.

### 4.5 Dashboard switcher
Add the existing `<SiteSelector>` prominently to the dashboard body (`src/app/page.tsx`), in addition to the sidebar. Front-and-center as requested.

### 4.6 Director follows the toggle
In `chat-view.tsx`, remove the per-conversation `chosenSiteId` override; always use `activeSiteId` from `useActiveSite`. Confirm `api/director/message/route.ts` resolves the site from the active-site setting as the source of truth (not an arbitrary client override).

## 5. Testing
- **Unit:** `getActiveSiteId()` returns the stored id / `null`.
- **Integration (live-DB):** ideas/articles/runs queries are site-scoped; ideas backfill picks the right site from run/cycle/keyword.
- **Manual:** toggle site → every listed surface re-scopes; the Director uses the active site; the dashboard switcher works; the perf cron touches all sites.

## 6. Risks & mitigations
- **Orphan ideas** with no run/cycle/keyword → explicit handling before the `NOT NULL` tighten.
- **`NOT NULL` ordering** → add nullable → backfill → verify → tighten (never `NOT NULL` in one shot).
- **Missing a surface** → the centralized helper + a final `grep` sweep for any residual `ui.activeSiteId` / `listSites()[0]` / `getSiteByKey(` site-resolution.

## 7. Implementation order
1. Add `getActiveSiteId()`; replace all call sites (no behavior change).
2. Add site filter to Runs, Articles, Pipeline.
3. `ideas` schema change → backfill → filter → stamp on insert.
4. Fix performance cron (all sites).
5. Dashboard switcher.
6. Director lock to active site.
7. Verify sweep + tests + `tsc`/lint/build.
