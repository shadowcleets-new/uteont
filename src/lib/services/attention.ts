/**
 * @file attention.ts
 * @description LO-21 — cognitive guardrails. "Quiet by default": the system
 * surfaces what genuinely needs the operator and lets everything else recede.
 * This is the pure severity model + a summary the dashboard uses to show
 * "N need you · M done" instead of a flat wall of equally-loud events.
 */

export type Severity = "critical" | "attention" | "info";

const HIGH_BLAST = 10; // matches the checkpoint machine's type-to-confirm threshold

export interface AttentionItem {
  kind: "checkpoint" | "run";
  status: string;
  blastRadius?: number;
}

/** Rank one item. Pure. */
export function attentionSeverity(item: AttentionItem): Severity {
  if (item.kind === "checkpoint" && item.status === "pending") {
    return (item.blastRadius ?? 0) >= HIGH_BLAST ? "critical" : "attention";
  }
  if (item.kind === "run" && item.status === "failure") return "attention";
  return "info";
}

export interface AttentionSummary {
  needsYou: number;  // items awaiting a human (pending checkpoints + failed runs)
  critical: number;  // the subset that's high-severity
  done: number;      // quiet, successful work
}

/**
 * Fold checkpoints + runs into a quiet-by-default summary. Pure. The dashboard
 * shows `needsYou` prominently (with `critical` highlighted) and `done` muted.
 */
export function summarizeAttention(input: {
  checkpoints: Array<{ status: string; blastRadius?: number }>;
  runs: Array<{ status: string }>;
}): AttentionSummary {
  let needsYou = 0;
  let critical = 0;
  let done = 0;

  for (const cp of input.checkpoints) {
    const sev = attentionSeverity({ kind: "checkpoint", status: cp.status, blastRadius: cp.blastRadius });
    if (sev === "critical") {
      critical++;
      needsYou++;
    } else if (sev === "attention") {
      needsYou++;
    } else if (cp.status === "approved" || cp.status === "rejected" || cp.status === "edited") {
      // A decided checkpoint is finished work — count it toward `done` so the
      // contract holds for callers that pass mixed-status checkpoints (the
      // dashboard passes pending-only today, which masked this).
      done++;
    }
  }
  for (const r of input.runs) {
    const sev = attentionSeverity({ kind: "run", status: r.status });
    if (sev === "attention") needsYou++;
    else if (r.status === "success") done++;
  }

  return { needsYou, critical, done };
}
