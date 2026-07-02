# Director Goal Plans — Phase 2 (plan-first + autonomous between gates)

- **Date:** 2026-07-01 · **Status:** Approved by owner (design presented in chat)
- **Owner decisions:** approve plan once + content gates only · ordered sequence (no calendar) · chat + Plan page · plan frozen at approval.

## 1. Goal

Tell the Director a goal → it returns a numbered, structured plan (what/how per step, where it pauses) → one "go" → it executes itself: step completes → results posted to the chat → next step auto-dispatches → at a content gate (ideas / articles / outreach) it pauses for the Approvals inbox → approval auto-resumes. Skip research when the goal already names keywords.

## 2. Non-goals

- Telegram gate pings with step-N-of-M context (Phase 3). Existing `notifyJobSuccess` Telegram messages stay as-is.
- Calendar pacing (owner chose ordered sequence), publishing automation (agent #9 unbuilt), multi-plan concurrency per site (one **active** plan per site at a time; new plan proposals are allowed while one runs, but activation is blocked until the active one finishes/cancels).

## 3. Grounding facts (from code, informing the design)

- `runDirectorTurn` (director.ts) already does propose→approve→execute with per-batch approval (LO-55); `runDirectorReport` (director.ts:605) is **dead code** — nothing calls it.
- `applyJobResult` (jobs.ts) is the single completion funnel: persists output → creates gate checkpoints (`CHECKPOINT_GATES`: idea-generation→A, content-writing→B, backlink→C) → Telegram → Critic → chat system message. Plan advancement hooks here.
- `decideCheckpoint` (checkpoints.ts) only flips checkpoint status (+audit/Slack). Gate-resume is new. Undo window exists: resume fires on approve immediately; a later undo does NOT claw back a dispatched step (accepted; noted in UI copy).
- **fn vs worker runtime:** qa/seo-optimization run inline on Vercel (worker handlers deleted — worker.py:73-76). `dispatchAgentJob` ALWAYS enqueues to the worker queue → the Director's existing `qa_validation`/`seo_optimization` dispatch is a latent stuck-forever bug. The plan driver must route fn steps inline (via the `runAgent` path) and worker steps through the queue. Fix the Director's map as part of this phase.
- `ideas.runId` column exists but `persistIdeas` never stamps it → stamp it, so "ideas produced by plan step N" is queryable.
- `failJob` (jobs.ts) retries with backoff until `attempts>=maxAttempts` → terminal `failed`; plan pauses there.

## 4. Data model — `plans` table

```
plans:
  id            serial PK
  siteId        int NOT NULL → sites (cascade)
  conversationId int NOT NULL → conversations
  goal          text NOT NULL
  status        text NOT NULL default 'draft'
                -- draft | active | paused-gate | completed | failed | cancelled
  currentStep   int NOT NULL default 0        -- 1-based; 0 = not started
  steps         jsonb NOT NULL                -- PlanStep[]
  approvedAt / createdAt / updatedAt timestamptz
  indexes: bySite, byConversation, byStatus
```

`PlanStep` (TS type, validated with zod at write time):
```
{ n, tool, agentKey, title, how,            // what + how (owner-readable)
  args: Record<string,unknown>,             // static args, frozen at approval
  gated: boolean,                           // derived SERVER-SIDE from CHECKPOINT_GATES — never trusted from the model
  status: "pending"|"running"|"awaiting-gate"|"done"|"failed"|"skipped",
  jobIds?: number[], runIds?: number[], checkpointId?: number|null }
```
One JSONB column (not a steps table): single-operator app, strictly sequential updates through one funnel. `// ponytail: steps as JSONB; split into a table if steps ever update concurrently.`

## 5. Director changes (plan proposal)

- Response schema gains optional `plan: { steps: [{tool,title,how,args}] }` on `intent:"propose"`. Prompt: PLANNING rules — multi-step goals return the full ordered plan (≤8 steps); **if the goal names explicit keyword(s), OMIT research and start at idea_generation with those keywords**; each step gets a one-line `how`; note which steps pause for review (server re-derives `gated` itself).
- On propose-with-plan: persist a `plans` row (status `draft`, supersede any older draft for the conversation), render numbered steps in the chat text with 🔒 markers on gated steps + "Reply go — I'll run this plan and only stop at the marked reviews."
- **Approval turn is deterministic (no Gemini call):** when `isApprovalMessage(userMsg)` and the conversation has a `draft` plan → server activates it (status `active`, `approvedAt`), dispatches step 1, appends the assistant message "Plan approved — running step 1 of M: <title>". Model output can't inject new work post-approval: execution reads ONLY the frozen `plans.steps`. No draft plan → today's per-batch flow unchanged (backward compatible).
- Fix `TOOL_TO_AGENT` latent bug: `qa_validation`/`seo_optimization` must not enqueue worker jobs (route inline or drop from dispatchable tools; plan driver handles them inline).

## 6. Plan driver (new `src/lib/services/plan-driver.ts`)

Event-driven — no cron. Entry points:

- `dispatchStep(plan, n)`: resolve args (below) → worker agents: `dispatchAgentJob(payload + {_planContext:{planId,stepN}})` (cache-hit mode counts as instant completion); fn agents (qa/seo): run inline via the `runAgent` path per target article, synchronously advance. Mark step `running` (store jobIds/runIds).
- `onJobResult(planId, stepN, jobId, runId)`: called from `applyJobResult` when payload has `_planContext`. Multi-job steps complete when ALL jobs land. Then: gated output? → step `awaiting-gate` + plan `paused-gate` (checkpointId linked; checkpoint payload gains `planId`/`stepN`) → chat message "Step N of M done — review in Approvals; I'll continue when you approve." Ungated → step `done`, `currentStep=n+1`, auto `dispatchStep(n+1)`; last step → plan `completed` + summary chat message. All chat comebacks are `role:"system"` + a deterministic assistant message (NOT a fresh Gemini turn; `runDirectorReport` stays unused for advancement — deterministic > replanning; the owner can always ask the Director about results).
- `onCheckpointDecision(checkpoint, verb)`: called from `decideCheckpoint` when the checkpoint carries plan context. approve → step `done`, resume next step. reject → plan `cancelled` + chat message ("Plan stopped at step N — <title> was rejected."). Other verbs (edit) treated as approve-after-edit.
- `onJobFailedTerminal(planId, stepN)`: from `failJob`'s terminal branch → step `failed`, plan `failed`, chat message with the error + "say 'retry the plan' to resume" (retry = re-dispatch the failed step, plan back to `active`).
- All hooks best-effort try/catch — a plan-driver bug must never break job completion itself (matches the applyJobResult convention).

**Arg resolution at dispatch time** (static args pass through; dynamic inputs resolved server-side):
- `idea_generation`: `args.keywords` if present, else approved keywords for the site (latest 10).
- `content_writing`: **fan-out** — one job per idea from THIS plan's idea step (`ideas.runId ∈ idea-step runIds`, `status != 'rejected'`, cap 5, `// ponytail: cap 5 drafts/step`). Owner cherry-picks by rejecting ideas on /ideas BEFORE approving the gate. No idea step in plan (keywords given but drafting directly) → ideas awaiting-draft for the site.
- `qa`/`seo-optimization` (inline): per article created by the plan's content step (`articles.runId ∈ content-step runIds`).
- `research`: static seeds (Director's `ensureSeeds` already guarantees goal-aligned seeds).

## 7. Approval semantics change (security note)

Today: every execute batch needs a fresh "go" (LO-55). New: **one "go" authorizes exactly the frozen steps of that plan** — nothing else. Injection surface shrinks: post-approval execution never consults model output. Autonomy levels: plan execution bypasses per-batch gating **by design** (that's what plan approval means) but still respects L1 (propose-only: plans can be proposed, not activated — same downgrade hint as today) and the outreach allowlist + agent-pause checks in `dispatchAgentJob` (unchanged, they sit at the dispatch boundary).

## 8. Plan page

`/plan`: active-site scoped (`getActiveSiteId`, `PickASite`). Shows current/latest plan: goal, status chip, "step N of M" progress, per-step rows (title, how, status, links to run/checkpoint), + recent completed plans. Dashboard gets a compact "Active plan: step N of M — <title>" line linking to /plan when one is active. Chat renders the proposal from the plan row (numbered list, 🔒 gates).

## 9. Testing

- Unit: plan step zod validation; gated derivation from CHECKPOINT_GATES; arg resolvers (ideas fan-out picks non-rejected ideas of the step's runs, cap enforced).
- Live-DB integration: create plan → activate → simulate applyJobResult with _planContext → step advances/pauses correctly; checkpoint approve resumes; reject cancels; terminal fail pauses; persistIdeas stamps runId.
- Manual: full myntra-style goal through chat with worker running.

## 10. Risks

- **Worker down** → step 1 sits queued; plan looks stuck. Mitigation: /plan shows "waiting for worker" when the step's job is queued >10 min (reuses the stale-job signal); Phase 3 watchdog covers alerting.
- **Checkpoint undo after resume** — next step may already run; accepted, copy says so.
- **Cached dispatch (dedup)** — a plan step can complete instantly from cache; onJobResult handles the synchronous path (applyJobResult is called inline during dispatch).
- **Plan JSONB races** — sequential by design (one funnel); read-modify-write kept inside one request path at a time.

## 11. Implementation order

1. Schema (`plans` + zod types) + `persistIdeas` runId stamp — one db:push (owner-gated).
2. plan-driver core (dispatch/advance/resolvers) + unit tests.
3. applyJobResult + failJob + decideCheckpoint hooks (+ checkpoint payload planId) + integration tests.
4. Director: planning prompt + schema, draft persistence, deterministic approval turn, TOOL_TO_AGENT qa/seo fix.
5. /plan page + dashboard line + chat proposal rendering.
6. Verification sweep (tsc/lint/vitest/build) + journal.
