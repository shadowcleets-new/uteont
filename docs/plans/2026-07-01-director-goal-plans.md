# Director Goal Plans (Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans or subagent-driven-development. Checkboxes track progress.

**Goal:** Goal → frozen numbered plan → one approval → event-driven autonomous execution pausing only at content gates, with auto-resume on approval, a /plan page, and comeback messages in the Director chat.

**Architecture:** New `plans` JSONB-steps table + `plan-driver.ts` (dispatch/advance/resolve), hooked into the three existing funnels (`applyJobResult`, `failJob` terminal branch, `decideCheckpoint`). Director gains a `plan` field on propose + a deterministic no-Gemini approval turn. Spec: `docs/specs/2026-07-01-director-goal-plans-design.md` (authoritative for semantics).

**Tech:** Next.js 16 App Router, Drizzle/Neon, zod, Vitest live-DB tests.

**Gate:** every task ends `npx tsc --noEmit` clean + targeted vitest green + commit. db:push steps need owner OK (established: run with `-- --force` after reading the printed statements).

---

### Task 1: Schema + types
- [ ] `src/lib/db/schema.ts`: `plans` table per spec §4 (+ `Plan` type export); indexes bySite/byConversation/byStatus.
- [ ] `src/lib/services/plan-types.ts`: `PlanStep` zod schema (`planStepSchema`, `planStepsSchema`), status unions, `PLAN_MAX_STEPS = 8`.
- [ ] `persistIdeas` (jobs.ts): accept + stamp `runId` (callers pass `run.id` from applyJobResult).
- [ ] db:push (owner-gated), test for runId stamping extends jobs.persist-ideas.test.ts.
- [ ] Commit `feat(plans): schema + step types + ideas.runId stamp`.

### Task 2: plans service
- [ ] `src/lib/services/plans.ts`: `createDraftPlan({siteId,conversationId,goal,steps})` (supersedes older drafts for the conversation → status cancelled), `getPlan`, `getActivePlanForSite`, `getLatestPlanForConversation(status?)`, `activatePlan(id)` (draft→active, blocks if site already has an active plan), `updateStep(planId, n, patch)` (read-modify-write JSONB), `setPlanStatus`. Gated derivation helper `isGatedAgent(agentKey)` reading CHECKPOINT_GATES keys.
- [ ] Live-DB test: create→activate→updateStep→supersede-draft→one-active-per-site guard.
- [ ] Commit.

### Task 3: plan-driver
- [ ] `src/lib/services/plan-driver.ts` per spec §6: `dispatchStep`, `onJobResult`, `onCheckpointDecision`, `onJobFailedTerminal`, `retryFailedPlan`; arg resolvers (`idea_generation` keywords fallback, `content_writing` fan-out cap 5 from step runIds w/ non-rejected ideas, qa/seo inline per article, research passthrough). Chat comebacks via `appendMessage` (system + assistant, deterministic copy w/ "step N of M").
- [ ] Hooks: `applyJobResult` (payload `_planContext` → onJobResult AFTER checkpoint creation so checkpointId is linkable — pass checkpoint row through), `failJob` terminal branch → onJobFailedTerminal, `decideCheckpoint` → onCheckpointDecision when `cp.payload.planId`. All wrapped try/catch-warn.
- [ ] Checkpoint payload gains `planId`/`stepN` when job carries plan context (in applyJobResult's createCheckpoint call).
- [ ] Live-DB integration test simulating the full advance/pause/resume/reject/fail paths with a fake 2-step plan (no worker needed — call applyJobResult directly).
- [ ] Commit.

### Task 4: Director integration
- [ ] director.ts: PLANNING block in BASE_SYSTEM_PROMPT (skip-research rule, ≤8 steps, how per step); responseSchema `plan` field; on propose-with-plan → `createDraftPlan` (server derives gated, validates via zod, clamps steps) + chat text rendered from the SAVED row (numbered, 🔒 on gated) + go hint.
- [ ] message route/turn: `isApprovalMessage` + draft plan exists → deterministic activation path (no Gemini): activate (L1 → downgrade hint instead), `dispatchStep(1)`, assistant message "Plan approved — running step 1 of M: <title>". Telegram webhook approval path reuses the same helper.
- [ ] Fix TOOL_TO_AGENT qa/seo latent bug: remove `qa_validation`/`seo_optimization` from dispatchable director tools (plan driver runs them inline; standalone qa/seo stay available on their agent pages).
- [ ] Tests: approval-turn helper unit test (draft→active, no plan→passthrough).
- [ ] Commit.

### Task 5: UI
- [ ] `src/app/plan/page.tsx`: active-site scoped (getActiveSiteId/PickASite); latest plan card — goal, status chip, "step N of M" bar, per-step rows (n/title/how/status, run/checkpoint links), stuck-worker hint when a running step's job is queued >10 min; recent plans list. Sidebar/dashboard: "Active plan: step N of M" line when active (dashboard) + /plan nav entry.
- [ ] Chat: plan proposal message renders numbered steps (plain markdown from Task 4 — verify display, no new component unless needed).
- [ ] Commit.

### Task 6: Verification sweep
- [ ] tsc, lint (no new violations), full vitest, `npm run build`.
- [ ] Straggler grep: no direct `plans.steps` JSON writes outside plans.ts/plan-driver.ts.
- [ ] Chronos changelog + active_context update; merge decision to owner (squash → main; deploy on owner word).
