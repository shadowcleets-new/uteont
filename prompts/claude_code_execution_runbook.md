# CLAUDE CODE EXECUTION RUNBOOK — Complete Specification (Milestones 1-10)

> Explicit, copy-pasteable instructions for the Claude Code CLI executing the 7-phase refactor in [`implementation_plan.md`](./implementation_plan.md).
> Each milestone lists target files, code modifications, DB migrations, and verification tests.
>
> **Stack reality:** UTEONT is **Next.js 16 (App Router) + Drizzle ORM + Neon Postgres**, not Express + Supabase. The runbook's file paths below use the existing project layout (`src/app/...`, `drizzle/<seq>_<slug>.sql`). Where a runbook step says "supabase/migrations/..." or "src/pages/api/...", translate to `drizzle/...` and `src/app/api/.../route.ts` respectively. The semantics (cascades, validation, snapshot, etc.) hold.

---

## MILESTONE 1/10 — Dashboard Layout & Sidebar Collapsibility

**Objective:** Collapsible workspace nav that persists state + three-tier information hierarchy on the dashboard.

### Step 1: Sidebar Component Modification

**Target file:** `src/components/sidebar.tsx`

> Refactor the Sidebar component to support collapsible states.
> 1. Import a persistence hook (`useLocalStorage` or backend-synced user-preferences hook).
> 2. Define boolean state `isCollapsed`, default `false`.
> 3. Add a toggle button at the top-right of the sidebar. Use a clean SVG icon (chevron-left when expanded, chevron-right when collapsed).
> 4. Bind hotkey `Cmd+\` / `Ctrl+\` to toggle.
> 5. Conditional Tailwind classes on container:
>    - Expanded: `w-64 px-4 transition-all duration-300 ease-in-out`
>    - Collapsed: `w-16 px-2 transition-all duration-300 ease-in-out`
> 6. When collapsed, hide nav labels and show only icons with hover tooltips for page names.

### Step 2: Main Dashboard Layout Restructuring

**Target file:** `src/app/page.tsx`

> Re-organize the main Dashboard component into a three-tier visual layout.
>
> **Tier 1 — Top Grid:** responsive grid (`grid-cols-1 md:grid-cols-4 gap-6`):
> - Active Projects (count)
> - Published Articles (count with positive trend indicator)
> - Total API Quota Used (progress bar of remaining credits)
> - Efficiency Ratio (`Published / Generated`)
>
> **Tier 2 — Operational Status:** two-column layout below the grid:
> - Left 60% — active background agent runs with progress bars showing sub-tasks
> - Right 40% — quick-access approval card (pending count + direct nav shortcut)
>
> **Tier 3 — Live Agent Console:** collapsible terminal panel (`bg-slate-950 text-emerald-400 p-4 rounded-lg font-mono text-xs`) at page bottom. Streams live logs from the agent process. Include a **Pause Stream** toggle.

### Step 3: Verification

```bash
npm run test src/components/sidebar.test.tsx
```

**Manual check:** click collapse → refresh browser → sidebar must remain collapsed. No horizontal scrollbars on the dashboard grid.

---

## MILESTONE 2/10 — Site Management & Integration Validation

**Objective:** Safe cascading deletion for configured sites + pre-flight validation blocking duplicate integrations.

### Step 1: Database Schema Migration

**Target file:** `drizzle/<next-seq>_add_cascades_and_uniqueness.sql`

> Generate a Drizzle migration that:
> 1. Drops existing FKs on `targets`, `approvals`, `runs`, `keywords`, `integrations`.
> 2. Re-adds them pointing to `sites.id` with `ON DELETE CASCADE`.
> 3. Creates a unique composite index `uq_site_integration_type` on `integrations(workspace_id, target_domain, integration_type)`.

> Use the existing Drizzle workflow: edit `src/lib/db/schema.ts`, run `npm run db:generate`, hand-edit the generated SQL to add cascades + composite unique index, rename to a readable slug, commit both the schema and the SQL.

### Step 2: Backend Site Deletion Service

**Target file:** `src/app/api/sites/[id]/route.ts`

> Modify the DELETE handler:
> 1. Query if the site has active `running` rows in `runs`.
> 2. If active runs exist → reject `400 Bad Request`: "Cannot delete a site with active agent runs. Please stop the agent execution first."
> 3. Else, start a DB transaction.
> 4. `DELETE FROM sites WHERE id = :siteId;`
> 5. Trigger async cloud-storage purge for cached images / directory files for that site ID.
> 6. Commit. On error, rollback cleanly.

### Step 3: Integration Duplication Safeguard

**Target file:** `src/app/api/sites/[id]/integrations/route.ts` (POST handler)

> Before persisting a new integration:
> 1. Pre-flight lookup using `(workspace_id, target_domain, integration_type)`.
> 2. If a matching record exists → block.
> 3. Return `409 Conflict`:
>    `{ "error": "This CMS or domain integration already exists. If you are experiencing credential issues, select 'Re-verify' to refresh authentication." }`

---

## MILESTONE 3/10 — Target Metric Guidance & Word-Count Tooltips

**Objective:** Replace vague input configs with contextual rich-text explanations + a real-time cost projection.

### Step 1: Target UI Enhancement

**Target file:** `src/components/targets/TargetConfigForm.tsx` (create if missing — falls under the new Sites/Targets workspace introduced in Milestone 2).

> Add context helpers to configuration target fields.
> 1. Integrate informational Tooltips next to **Target Word Count** and **Baseline Coverage Score** inputs.
> 2. Render tooltips via a hover-triggered popover from the existing UI library (`@base-ui/react` is installed; `shadcn` is also available).
> 3. Tooltip copy:
>    - **Target Word Count:** "Defines the length of the written draft. Higher counts require deeper outline generation and increase total token costs."
>    - **Baseline Coverage Score:** "Evaluates the draft's topical authority against top-ranking SERP competitors. Aiming for 70+ forces the system to perform exhaustive, multi-step sub-agent searches."

### Step 2: Dynamic Resource Cost Preview

**Target file:** `src/components/targets/TargetConfigForm.tsx`

> Live reactive resource indicator:
> 1. Track numerical state of `wordCount` and `coverageScore`.
> 2. `Projected Complexity = (wordCount * coverageScore * 1.4)`.
> 3. Progress bar labeled **Projected Run Cost**:
>    - `< 5000`: green — "Highly Cost-Effective"
>    - `5000 – 12000`: yellow — "Moderate Token Usage"
>    - `> 12000`: orange/red — "Resource Intensive"

### Step 3: Verification

Manual: open the target config form, hover tooltips, set wordCount=2500 and coverage=85 → bar must go amber/red.

---

## MILESTONE 4/10 — Split-Pane Article Inspection & Action Shell

**Objective:** Render full draft outputs in rich Markdown with immediate Approve / Shelf / Reject controls.

### Step 1: Split-Pane List-Detail UI

**Target file:** `src/components/approvals/ApprovalDrawer.tsx` (and the page that mounts it, currently the GAPS_REPORT calls out an `Approvals` route — wire it through `src/app/approvals/page.tsx`).

> Refactor the Approvals container into a split-pane layout on desktop:
> 1. Left list 40% / right canvas 60%. Stack vertically on mobile.
> 2. Auto-select the first article when the page mounts.
> 3. Right canvas renders full title + body through a Markdown parser (`react-markdown` or equivalent). High-legibility typography: `prose prose-slate dark:prose-invert max-w-none`.

### Step 2: Floating Sticky Action Bar

**Target file:** `src/components/approvals/ApprovalActionPanel.tsx`

> Floating sticky panel pinned bottom-right of the inspection canvas. Three buttons:
> - **Approve & Publish** (solid green) — POST to CMS publisher, mark `published`.
> - **Shelf Draft** (amber outline) — set status `shelved`, hide from active list.
> - **Reject & Edit** (red outline) — open inline feedback textarea, pass notes back to the writing agent as revision instructions.
>
> Optimistic UI: animate the panel out, update local list state instantly, fire the async DB API request in the background. Roll back + alert on failure.

### Step 3: Verification

```bash
npm run test src/app/approvals
```

Manual: load Approvals, verify right pane renders Markdown formatting; submit a Reject with notes; verify card removed from list and backend record updated.

---

## MILESTONE 5/10 — Reconstructed Conversational Director Workspace

**Objective:** Upgrade Director Chat to a modern LLM interface with inline commands, typing cues, and self-anchoring scroll.

### Step 1: Fluid Chat Bubbles & Typing Components

**Target files:** `src/app/chat/chat-view.tsx` (existing entry point), `src/components/chat/DirectorChat.tsx` (new)

> Rebuild the chat container:
> - User messages: right-aligned, dark-indigo bubble, white text.
> - Director / agent messages: left-aligned, slate bubble, dark text, prefixed with an agent SVG.
> - Markdown rendering pipeline for assistant replies.
> - Animated typing status (three pulsing `animate-bounce` dots) while awaiting responses.

### Step 2: Input Controls & Slash Command Dropdown

**Target file:** `src/components/chat/ChatInput.tsx` (new)

> Auto-resizing textarea (max 200 px) with:
> 1. Slash-command popover on leading `/`:
>    - `/research [query]` — spawn a Research Agent background job.
>    - `/audit [url]` — start a competitive site audit.
>    - `/status` — return current pipeline health.
> 2. `Enter` submits; `Shift+Enter` inserts a newline.
> 3. Blank submissions trigger no network calls.

### Step 3: Self-Anchoring Scroll Logic

**Target file:** `src/components/chat/MessageFeed.tsx` (new)

> 1. Subscribe to message-container updates; on new fragment or typing state, scroll to the base element.
> 2. If the user scrolls up manually, suspend auto-scroll.
> 3. Show a floating pill "Jump to Present ↓" when scrolled away from the latest message; tapping it returns to bottom.

---

## MILESTONE 6/10 — Multi-Agent State-Machine Pipeline Consolidation

**Objective:** Replace the 14-tab agent cluster with a unified background sequential workflow + clear visual stepper.

### Step 1: Sequential Process Visualizer

**Target file:** `src/components/pipeline/AgentPipelineStepper.tsx` (new)

> Horizontal stepper with six explicit nodes:
> `[1] Setup Target → [2] Live Research → [3] Brief & Outline → [4] Writing Engine → [5] QA & Verification → [6] SEO Audit`
>
> State classes per node:
> - **Pending:** neutral border, desaturated text.
> - **Running:** pulsing indigo border, active loader, bold label.
> - **Completed:** accent fill, checkmark icon, green label.
> - **Failed:** destructive red border, exclamation icon, hover tooltip with error context.
>
> Mount the stepper at the top of the active-runs dashboard panel.

### Step 2: Asynchronous State Machine Controller

**Target file:** `src/app/api/pipeline/run/route.ts` (new) — replaces the per-agent fan-out at `src/app/api/agents/[key]/run/route.ts` for the unified pipeline path.

> Unified backend state-machine coordinator:
> 1. On run submission, create a central `RunState` record tracking `current_step` and `step_payloads`.
> 2. Sequential sub-agent dispatch via the existing `jobs` queue:
>    - Invoke Research sub-agent → write JSON to `state_context.step_payloads.research`.
>    - Auto-pass research payload → Outline sub-agent.
>    - Silently chain outline → Writing & Drafting sub-agent (background, no human gate).
>    - Dispatch draft → QA sub-agent vs. word/coverage targets.
>    - Route draft → SEO sub-agent for metadata + schema injection.
> 3. Update `current_step` on each transition. On error: halt, flag step `failed`, persist detailed log to DB.

### Step 3: Verification

Manual: trigger a new run; the stepper must transition smoothly from Live Research → SEO Audit with no page reloads or fragmented panels. Confirm DB records the complete state payload object at each milestone.

---

## MILESTONE 7/10 — Competitor Auditing & Site Crawling Workspace Segregation

**Objective:** Move competitor tooling out of the main dashboard into a dedicated workspace tab.

### Step 1: Dedicated Competitor Routing & Sidebar Entry

**Target files:** `src/components/sidebar.tsx`, `src/app/competitors/page.tsx` (new)

> 1. Create `/competitors` route → `CompetitorsWorkspace.tsx`.
> 2. Add a sidebar entry labeled "Competitors" with a clear competitive icon (globe or target-line SVG).
> 3. Remove raw site-crawl / competitor-audit links from the main dashboard.

### Step 2: Competitors Dashboard Tab Layout

**Target file:** `src/app/competitors/page.tsx`

> Tabbed analytical workspace:
> 1. **Live Site Scraper** — input for competitor URLs + **Trigger Site Scan** button that spawns a background crawl job.
> 2. **Competitor Directory** — responsive grid: scanned domains, domain authorities, top organic keywords, active topical gaps.
> 3. **Export Report** — CSV + JSON exports of audited competitive data.

---

## MILESTONE 8/10 — Performance, SEO, & Revenue Analytics Portal

**Objective:** Unified analytics control center for search metrics, rankings, indexing, revenue trends — separated from operational agent tabs.

### Step 1: Analytics Container

**Target file:** `src/app/analytics/page.tsx` (new)

> 1. Time-range dropdown: Last 7 / 30 / 90 days.
> 2. Charting via `recharts` (or installed equivalent):
>    - Area chart — organic impressions + total clicks.
>    - Line chart — revenue trends mapped to published article counts.
> 3. Responsive containers so charts don't overflow when sidebar collapses.

### Step 2: Search Console Key-Data Table

**Target file:** `src/components/analytics/RankingsTable.tsx` (new)

> Columns: Keyword · Avg SERP Position · CTR · Total Impressions · Revenue Impact (High / Medium / Low).
> Client-side sorting + filtering, including position brackets ("Top 3", "Top 10", "Page 2+").

---

## MILESTONE 9/10 — Detailed Runs Debug Console & Granular Settings

**Objective:** Rich debugger timeline for runs + an LLM/safety configuration panel for Settings.

### Step 1: Granular Runs Log Inspector

**Target files:** `src/app/runs/page.tsx`, `src/components/runs/LogTerminal.tsx` (new)

> Re-engineer the runs tracking table.
> 1. Each list item is an expandable card.
> 2. Expanded view: step-by-step debugger timeline (Outline Generation, Content Assembly, QA Sweep, ...).
> 3. Show API execution times, token counts, and calculated financial cost per sub-step.
> 4. Failed step → red indicator + **Copy Error Stack** button + troubleshooting tip (e.g., "Rate limit reached. Automatic queue retry in 60s...").

### Step 2: Workspace Settings & Engine Configuration

**Target file:** `src/app/settings/page.tsx`

> Categorized settings panel:
> - **Category A — API Integration & Billing:** input + validate API keys for search and LLM providers; instant **Check Status** validator.
> - **Category B — Agent Configuration:** sliders for global rate limits, max token spend per article run, model picker (Claude Opus / Sonnet / fast cheap models for testing).

---

## MILESTONE 10/10 — Closed-Loop Negative Keyword Reinforcement

**Objective:** Automated DB-backed feedback that records rejected keywords/ideas and dynamically updates system prompts — preventing duplicate generation, saving token budget.

### Step 1: Database Feedback Schema

**Target file:** `drizzle/<next-seq>_create_exclusions_table.sql`

> Create `keyword_exclusions`:
> - `id` (PK; project convention is `serial` — `uuid` is also fine if you switch the rest of the schema)
> - `site_id` (FK → `sites.id` ON DELETE CASCADE)
> - `phrase` (lowercased; unique composite index on `(site_id, LOWER(phrase))`)
> - `reason` (optional metadata)
> - `created_at` (timestamp)

### Step 2: Negative Keyword Storage Hook

**Target file:** `src/app/api/keywords/[id]/route.ts` (existing) or `src/app/api/keywords/action/route.ts` (new) — depending on where the reject action lives after Milestone 4.

> When a user rejects or disapproves a keyword/idea:
> 1. Capture the payload.
> 2. Write the phrase to `keyword_exclusions` scoped to the `site_id`.

### Step 3: Dynamic System Prompt Constraint Injection

**Target file:** `src/lib/services/agent/prompts.ts` (new — colocated with `src/lib/services/director.ts`).

> Refactor the system prompt builder for Research and Ideation agents.
> 1. Before any LLM call, fetch the full exclusion list for the active `site_id`.
> 2. Serialize as comma-separated list.
> 3. Inject negative-prompt block:
>    ```
>    NEGATIVE CONSTRAINT INSTRUCTION:
>    Under no circumstances are you allowed to generate keywords, topics, or outlines semantically similar to:
>    [{serialized_exclusions_list}].
>    These terms have been explicitly rejected by the client. Skip them and focus on alternate, high-value topical directions.
>    ```

### Step 4: Verification Integration Test

Manual: disapprove "credit card rewards" on a site → trigger a fresh research mock run → verify the agent prompt output includes the exclusion block, and the generated keywords are free of credit-card-reward topics.

---

## CROSS-REFERENCE — Phase ↔ Milestone Map

| Phase | Milestones |
| --- | --- |
| 1 — Workspace & UI/UX Layout | 1 |
| 2 — Data & Integrations Management | 2 |
| 3 — Decisions & Target Explanations | 3 |
| 4 — Deep-Dive Approvals Interface | 4 |
| 5 — Conversational Workspace | 5 |
| 6 — Streamlined Multi-Agent Pipeline | 6, 7, 8 |
| 7 — Closed-Loop Negative Reinforcement | 9, 10 |

Architecture context for each phase lives in [`implementation_plan.md`](./implementation_plan.md).
