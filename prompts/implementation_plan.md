# SYSTEM ARCHITECTURE & UI/UX REFACTORING MASTER INSTRUCTION

> **Scope:** UTEONT — AI-driven SEO and content engine refactor.
> **Audience:** Claude Code + delegated subagents.
> **Source:** Canonical product/architecture spec for the 7-phase / 10-milestone refactor.

---

## SYSTEM ROLE DEFINITION

You will act as a unified team of elite industry experts working together to refactor this AI-driven SEO and Content Engine. Every architectural decision must balance computational optimization with elite-tier product aesthetics:

- **Lead Agentic Systems Architect** — designs complex, asynchronous multi-agent pipelines, stateful feedback loops, and highly optimized LLM token/quota management systems. Maps structural execution, database schemas (relational and vector), edge-case recovery mechanics, and background processes. Ensures agents do not run in infinite loops or make redundant API calls, keeping operational overhead strictly minimized.
- **Principal UX/UI Engineer** — builds minimalist, responsive, and highly usable dashboard layouts inspired by Linear, Stripe, and Vercel. Specializes in micro-interactions, layout-shift prevention, dynamic information density, clear typographic hierarchies, intuitive keyboard-navigable interaction models, and contextual tooltips.
- **Data & Machine Learning Feedback Engineer** — builds stateful reinforcement mechanisms. Ensures user-rejection data (shelved keywords, disapproved ideas, edited draft snippets) dynamically modifies downstream vector queries, system-prompt contexts, and agentic reasoning paths. Specialty: closed-loop validation, semantic vector alignment, programmatic content filtering to eliminate token waste.

---

## THE OVERARCHING VISION

Automate high-ROI content generation without wasting precious API quotas or frustrating human editors. Every single UI improvement, agent refinement, and database schema change must serve one target: **minimize friction for the human-in-the-loop editor while maximizing the programmatic precision, execution speed, and autonomous intelligence of the underlying agent workforce.**

---

## TASK ROADMAP & IMPLEMENTATION PLAN (7 PHASES)

Execute this refactoring in seven distinct, sequential phases. Do not move to the next phase until the current phase is fully implemented, compiled, and verified with automated checks and mock environment tests.

```
+-------------------------------------------------------------+
|              PHASE 1: Workspace & UI/UX Layout              |
|        (Collapsible Navigation, 3-Tier Dashboard)           |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              PHASE 2: Data & Integrations Management        |
|        (Cascade Deletion, Integration Deduplication)        |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              PHASE 3: Decisions & Target Explanations       |
|        (Explanatory Tooltips, Formulaic Cost Previews)      |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              PHASE 4: Deep-Dive Approvals Interface         |
|        (Split-Pane Markdown Editor, Sticky Quick Actions)   |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              PHASE 5: Conversational Workspace              |
|        (Director Chat Upgrade, Quick Slash Commands)        |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              PHASE 6: Streamlined Multi-Agent Pipeline      |
|        (Linear Workflow, Analytics & Competitor Tabs)       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              PHASE 7: Closed-Loop Negative Reinforcement    |
|        (Keyword Exclusions, Runs Depth & Settings)          |
+-------------------------------------------------------------+
```

---

### PHASE 1 — Workspace & UI/UX Layout

**1. Collapsible Sidebar Navigation**

- Problem: persistent sidebar wastes horizontal screen real estate on 13" laptops; causes text wrapping in dense data columns.
- Action items:
  - Design a high-quality toggle button (hotkey `Cmd+\` / `Ctrl+\`) at the top or bottom of the sidebar.
  - Implement smooth, GPU-accelerated CSS transitions (`transition-all duration-300 ease-in-out`) collapsing the sidebar into a 64 px icon-only rail or fully hiding it for mobile. Zero CLS during transition.
  - Persist sidebar state in `localStorage` (`ui.sidebarCollapsed`) and optionally in a user-preferences table, surviving full refreshes and cross-session.

**2. Multi-Tier Overview Dashboard**

- Problem: flat layout makes critical status updates blend in with minor stats.
- Action items:
  - **Top View (High-Level KPIs)** — responsive grid of cards: active projects, total content published, organic traffic growth, overall API quota utilization, content-to-published ratio (`Published / Generated`). Each card must include sparklines of historical trends over the selected time range.
  - **Middle View (Operational Velocity)** — interactive status dashboard with active agent runs, pending approval queue counts, CMS integration health (green/yellow/red), and current average cost per generated draft.
  - **Fine-Grain View (Activity Log)** — real-time, collapsible status stream showing exactly what individual agents are doing right now (e.g., "Research Agent is crawling Google SERPs for keyword 'AI SEO trends'..."). Terminal-style live-scrolling panel for advanced users.

---

### PHASE 2 — Data & Integrations Management

**1. Cascading Site Deletion Capability**

- Problem: users can't delete test sites; leftover crons fire on abandoned sites and burn API spend.
- Action items:
  - Add a "Delete Site" action in Site Settings, styled destructive red-on-hover.
  - Two-step confirmation modal: user must type the site's domain name to unlock the action.
  - Transactional cascading delete removes targets, keyword lists, ideas, drafts, runs. Orphaned cloud-storage media must also be removed.

**2. Integration Verifier & Deduplicator**

- Problem: duplicate CMS/API integrations cause duplicated posts and infinite sync loops.
- Action items:
  - Validation middleware + DB unique-constraint check on `(workspace_id, target_domain, integration_type)`.
  - Intercept saves: if a duplicate exists, block creation, show "This connection is already active", offer "Re-verify or Update Credentials".
  - Automated ping test on save to assess connection health in real time.

---

### PHASE 3 — Decisions & Target Explanations

**1. Explanatory Context for "Targets" and "Decisions"**

- Problem: target word-count `800`, baseline coverage `70` — no context, leading to poor outputs and wasted tokens.
- Action items:
  - Rich-text tooltips / contextual popovers / inline helper blocks next to every target field.
  - Sample copy:
    - **Target Word Count (e.g., 800 words):** "Instructs the Content Writer Agent on the ideal semantic length to compete on the first page of Google based on competitor average lengths."
    - **Baseline Coverage Score (e.g., 70/100):** "Defines the required topical coverage depth based on competitor entities. Higher numbers force the agent to run exhaustive, deep searches on sub-topics, increasing API token costs but improving topical authority."
  - Live cost projection model below the form using `Projected Tokens ∝ (Word Count × Baseline Coverage × 1.4)`. Render a progress bar transitioning green → amber → red.

---

### PHASE 4 — Deep-Dive Approvals Interface

**1. Split-Pane Article Inspection & Editing**

- Problem: tiny snippets force blind decisions or external lookups.
- Action items:
  - Split-pane (list-detail) or right-side sliding drawer for full-article preview.
  - Markdown-rendered body with optimized typography (line height, margins, headers, lists, bold, code).
  - Floating sticky action bar:
    - **Approve & Publish** — dispatch HTML/MD to CMS, mark `published`.
    - **Shelf / Hold** — cold-storage state, keep available for manual editing.
    - **Reject & Refine** — feedback field appended to writing agent's next-run instructions.

---

### PHASE 5 — Conversational Workspace (Director Chat)

**1. Conversational Steering Upgrades**

- Problem: primitive text boxes, no scrolling polish, no typing cues — doesn't match modern LLM interfaces.
- Action items:
  - Rebuild chat: elegant chat bubbles, distinct avatars, markdown rendering, live typing indicator.
  - Quick-action command chips above input (`/research [topic]`, `/audit [url]`, `/status [site]`).
  - Auto-scroll-to-bottom with manual override (floating "Scroll to bottom" pill). Full keyboard accessibility (Enter submits, Shift+Enter newline).

---

### PHASE 6 — Streamlined Multi-Agent Pipeline

**1. Pipeline Consolidation**

- Problem: 14+ separate agent tabs → cognitive overload, redundant API calls, latency.
- Action items:
  - Consolidate into one linear sequential pipeline:
    1. **Command Input** — user sets targets / commands Director.
    2. **Research & Ideation Layer** — Research Agent builds topical maps + SERP crawl; Ideation Agent translates into content briefs.
    3. **Writing Engine (Background)** — Briefing + Drafting + Rewriting merged into a single backend thread; intermediate state stays internal.
    4. **QA Validation** — compare against word-count + baseline coverage rules.
    5. **SEO Optimization** — entity density, schemas, link anchors, formatting fixes.
    6. **Approval Queue** — clean finalized draft to Approvals Drawer.
  - Visual progress pipeline indicator (stepper component) so the user always knows the run status.

**2. Segmented Workspace Tabs**

- Problem: competitor auditing, crawlers, search-console metrics, revenue charts all crowd the same workspace.
- Action items:
  - **Competitors Tab** — SERP trackers, auditing tools, site crawlers.
  - **Analytics Tab** — performance monitoring (search volume, CTR, revenue trends over time).

---

### PHASE 7 — Closed-Loop Negative Reinforcement

**1. Dynamic Keyword/Idea Feedback Loop**

- Problem: shelved/disapproved feedback never reaches generation agents — they keep suggesting the same keywords.
- Action items:
  - State-driven feedback loop: a lightweight extraction subagent captures core semantic patterns from each rejected item.
  - Persist to an `excluded_patterns` array / negative embedding collection scoped to the site.
  - Inject into Research & Ideation system prompts as a **CRITICAL CONSTRAINT** block.
  - Verify programmatically: rejecting "best credit card" must auto-block "top credit cards" / "credit cards for beginners".

**2. Runs & Settings Depth**

- Problem: bare-bones tabs with no debug visibility, no model configuration.
- Action items:
  - **Runs Tab** — structured progress bars, readable step-by-step output, active execution time, token-count overhead, human-readable error panels.
  - **Settings Tab** — categorized panel: defaults, API-key validation with instant status checks, rate-limit budgets, model picker (fast Claude Sonnet vs. reasoning Opus, etc.).

---

## CLAUDE CODE INSTRUCTIONS & METRICS FOR EXECUTION

- **Context Awareness** — scan file structures, routing, DB configuration before refactoring. Do not overwrite custom helpers or break state management paradigms.
- **Self-Verification Mode** — for every phase, write or update unit/integration tests to verify DB migrations, endpoint responses, and front-end state changes.
- **Token & Budget Management** — run heavy data modeling or refactoring analyses inside isolated subagents to keep the primary session fast.
- **State Cleanliness** — use `CLAUDE.md` to store critical project preferences, naming conventions, and layout styles so changes remain uniform across sessions.

---

# SYSTEM-WIDE IMPLEMENTATION PLAN: AUTONOMOUS SEO ENGINE

> Strict execution order, dependency mapping, and verification tests required to refactor the AI-driven SEO and Content Engine. Designed for zero operational leakage, zero database inconsistencies, and maximum token efficiency.

## DEPENDENCY FLOW MATRIX

Implementation must flow bottom-up: DB → business logic → agents → UI. Designing a UI for an agent pipeline before the state machine exists is the primary source of regression.

```
[Level 1: Database & Schema]
      │ (Migrate Tables, Constraints & Indexes)
      ▼
[Level 2: Core Business Logic]
      │ (Cascades, Deduplication, Exclusion Filters)
      ▼
[Level 3: Agent Pipelines]
      │ (Consolidating 14 Agents into Sequential Threads)
      ▼
[Level 4: Frontend & UI Components]
      │ (Collapsible Navigation, Drawer Panels, Chat Viewport)
      ▼
[Level 5: Integration & Verification Tests]
```

---

## LEVEL 1 — Database & Schema Foundations

**Step 1.1 — Cascade Schema for Site Deletion**
Modify foreign keys on `targets`, `approvals`, `runs`, `keywords`, `integrations` to `ON DELETE CASCADE` against `sites.id`.

**Step 1.2 — Unique Constraint on Integrations**
Composite unique index: `(workspace_id, target_domain, integration_type)`.

**Step 1.3 — Excluded Patterns Schema**
New `keyword_exclusions` table:

```sql
CREATE TABLE keyword_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  phrase VARCHAR(255) NOT NULL,
  reason VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_site_phrase ON keyword_exclusions(site_id, LOWER(phrase));
```

> **Stack note:** UTEONT runs on Drizzle ORM against Neon Postgres (not raw Supabase migrations). Use `drizzle/<seq>_<slug>.sql` hand-edited files; ID columns in existing tables are `serial` not `uuid`. Adapt the snippet above to match — keep `ON DELETE CASCADE` semantics intact.

---

## LEVEL 2 — Core Business Logic (Backend Services)

**Step 2.1 — Transactional Site Eraser Service**

1. Check for active runs; if found, abort or kill workers.
2. Start a DB transaction:
   - `DELETE FROM sites WHERE id = :site_id;`
   - Trigger cloud-storage purge for media assets.
3. Commit. On exception, rollback.

**Step 2.2 — Integration Pre-flight Validation Middleware**

1. REST pre-flight ping (e.g., `wp-json/v2` for WordPress).
2. Lookup via composite unique key.
3. If match found → `409 Conflict`:
   `{ "error": "This connection already exists. Click 'Re-verify' to refresh credentials." }`.

**Step 2.3 — Semantic Filtering Logic**

When Research Agent emits raw candidates:

1. Fetch `keyword_exclusions` rows for the site.
2. Exact match OR vector similarity:
   `Similarity(V_candidate, V_excluded) > 0.85  ⇒  reject keyword`.
3. Silently filter before user presentation or content generation.

---

## LEVEL 3 — Agent Pipeline Consolidation

```
       +------------------------------------+
       |       Director Agent (State)       |
       +------------------------------------+
                         │
                         ▼
       +------------------------------------+
       |    Research & Ideation Subagent    | <─── (Appends negative keyword lists)
       +------------------------------------+
                         │
                         ▼
       +------------------------------------+
       |  Writing Engine (Draft, QA, SEO)   | (Runs entirely in background)
       +------------------------------------+
                         │
                         ▼
       +------------------------------------+
       |     Approvals Drawer & DB Sync     |
       +------------------------------------+
```

**Step 3.1 — Sequential Orchestrator**

`RunState` machine: `IDLE → RESEARCHING → WRITING → QA_VALIDATING → PENDING_APPROVAL`. Merge Writing + QA + SEO into one background queue run (Celery/BullMQ analogue; UTEONT uses the existing `jobs` table polled by the Python worker). Intermediate outputs persist to DB only — never spawned as separate UI agent actions.

**Step 3.2 — Exclusions Context Injection**

Before LLM call, append:

```
SYSTEM WARNING: Under no circumstances should you generate topics or keywords related to:
{serialized_exclusion_list}. These have been explicitly rejected by the client.
```

---

## LEVEL 4 — Frontend & UI/UX Refactoring

**Step 4.1 — Collapsible Navigation Shell**

```ts
const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage("sidebar_collapsed", false);
```

- Expanded: `w-64`
- Collapsed: `w-16`

**Step 4.2 — Triple-Tier Dashboard UI**

Three stacked dashboards in `Dashboard.tsx`:
1. **Top Metrics Grid** — 4-col layout, big numbers + trend indicators.
2. **Active Status Panels** — visual progress of active pipelines + pending approvals.
3. **Active Stream Logs** — collapsible terminal view of running logs.

**Step 4.3 — Split-Pane Approvals Interface**

`Approvals.tsx`:
- Left col 35% — scrollable list of pending articles.
- Right col 65% — full article preview; empty-state graphic when nothing selected.
- Sticky header with **Approve**, **Shelf**, **Reject & Refine**.

**Step 4.4 — Conversational Chat Interface (Director)**

Markdown rendering, intersection observers for smart scroll, code-block formatting.

---

## LEVEL 5 — System Verification & Sanity Checks

```
[Database Constraint Test]
       │ (Check cascade paths & uniqueness indexes)
       ▼
[Feedback Loop Verification]
       │ (Validate keyword rejection updates prompt states)
       ▼
[Integration Security Test]
       │ (Verify identical channel blocks)
       ▼
[Orchestration Integration Test]
       │ (Simulate complete run from command to drawer)
```

- **Database Constraint Test** — create mock site, add dependents, delete site, confirm clean purge with `O(1)` query count.
- **Feedback Loop Verification** — call rejection endpoint, confirm `keyword_exclusions` row, verify next research run includes exclusion block.
- **Integration Security Test** — attempt duplicate WordPress integration in same workspace; expect interception.
- **Orchestration Integration Test** — execute full mock run; verify 14 background states transition through the unified state machine and produce a draft in the Approvals Drawer.

---

## CROSS-REFERENCE — Where to find the step-by-step

The 10-milestone, copy-pasteable execution plan lives in:

- [`prompts/claude_code_execution_runbook.md`](./claude_code_execution_runbook.md)

Each milestone there references the phase it implements in this document.
