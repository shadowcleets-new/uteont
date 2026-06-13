/**
 * Pure checkpoint decision logic — the design's five decision verbs + graduated
 * friction. Kept pure so the service + UI stay thin.
 */

export type Verb = "approve" | "reject" | "edit" | "defer" | "escalate";
export type CheckpointStatus = "pending" | "approved" | "rejected" | "edited" | "deferred" | "escalated";

export const VERBS: Verb[] = ["approve", "reject", "edit", "defer", "escalate"];

const NEXT: Record<Verb, CheckpointStatus> = {
  approve: "approved",
  reject: "rejected",
  edit: "edited",
  defer: "deferred",
  escalate: "escalated",
};

// Terminal = a final human decision was made. Deferred/escalated stay actionable.
const TERMINAL = new Set<CheckpointStatus>(["approved", "rejected", "edited"]);

export function isTerminal(status: CheckpointStatus): boolean {
  return TERMINAL.has(status);
}

/** Only open checkpoints (pending / deferred / escalated) can be decided. */
export function canDecide(status: CheckpointStatus): boolean {
  return !isTerminal(status);
}

export function applyVerb(status: CheckpointStatus, verb: Verb): CheckpointStatus {
  if (!canDecide(status)) throw new Error(`Checkpoint is ${status} (already decided)`);
  return NEXT[verb];
}

export type Friction = "none" | "confirm" | "type-to-confirm";

/** Graduated friction: the bigger the blast radius, the more deliberate the confirm. */
export function frictionFor(blastRadius: number): Friction {
  if (blastRadius >= 10) return "type-to-confirm";
  if (blastRadius >= 2) return "confirm";
  return "none";
}

/** Map a terminal verb to the approvals audit-log vocabulary. */
export function toApprovalDecision(verb: Verb): "approve" | "reject" | "edit" {
  if (verb === "approve") return "approve";
  if (verb === "edit") return "edit";
  return "reject";
}

/** LO-18: how long after a terminal decision the operator can still undo it. */
export const UNDO_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Can a checkpoint's decision be undone right now? Only terminal decisions
 * (approve/reject/edit) are undoable, and only within UNDO_WINDOW_MS of when
 * they were decided. Pure — `nowMs` is injected so it's testable.
 */
export function canUndo(
  status: CheckpointStatus,
  decidedAt: Date | string | number | null | undefined,
  nowMs: number,
): boolean {
  if (!isTerminal(status)) return false;
  if (decidedAt == null) return false;
  const decidedMs =
    decidedAt instanceof Date ? decidedAt.getTime() : new Date(decidedAt).getTime();
  if (!Number.isFinite(decidedMs)) return false;
  return nowMs - decidedMs <= UNDO_WINDOW_MS;
}
