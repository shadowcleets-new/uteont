# Phase 3 — Telegram plan notifications (design)

- **Date:** 2026-07-04 · **Status:** owner said "Proceed with Phase 3"
- **Goal:** Telegram pings for plan lifecycle so the owner can supervise from
  their phone: (1) step finished + next step started, (2) 🔒 gate awaiting
  review — with goal, step N of M, what to review, and how it proceeds,
  (3) plan completed / failed / cancelled.

## Grounding (verified in code)
- `sendMessage` (src/lib/services/telegram.ts:36) works; plain-text default
  (parse_mode opt-in after the Jun 21 fix). Bot + chat id already configured
  (notifyJobSuccess/notifyJobFailure fire today).
- All plan chat comebacks flow through ONE helper: `postPlanMessage`
  (src/lib/services/plan-driver.ts) — every advance/pause/complete/fail/cancel
  message passes through it. **Design: mirror each postPlanMessage to Telegram**
  (best-effort, try/catch) — one integration point, zero new state.
- Telegram webhook already supports approve/reject buttons for checkpoints
  (notify-job path); gate pings should reuse the checkpoint button pattern so
  approval FROM Telegram resumes the plan (decideCheckpoint → onCheckpointDecision
  hook already wired in Phase 2).

## Scope
1. `postPlanMessage` gains a Telegram mirror: prefix "📋 Plan #N — <goal (60ch)>"
   + the same body text (already contains step N of M wording).
2. Gate-pause message includes checkpoint id(s); reuse the existing inline
   approve/reject keyboard for the FIRST checkpoint of the batch (deep-link the
   rest to /approvals).
3. No new tables, no cron. Failure pings already exist via notifyJobFailure.

## Non-goals
- Notification preferences/muting (later); browser/push notifications.
