/**
 * Checkpoint (approval queue) persistence. Every read is defensive — it returns
 * empty/null if the `checkpoints` table doesn't exist yet (the migration is
 * staged but applied when the DB is reachable), so the inbox degrades to empty
 * rather than erroring. Decisions go through the pure state machine and also
 * write an `approvals` audit row for terminal verbs.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { checkpoints, type Checkpoint } from "@/lib/db/schema";
import { applyVerb, canDecide, toApprovalDecision, type CheckpointStatus, type Verb } from "./checkpoint-machine";
import { recordApproval } from "./approvals";
import { notifySlackForSite } from "./slack-notify";

export class CheckpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointError";
  }
}

/**
 * A DB error that should surface as retryable (vs. a legitimate not-found).
 * Carries `retryable: true` so callers/UI can offer a "try again" instead of
 * treating a transient blip as a vanished checkpoint.
 */
export class CheckpointDbError extends Error {
  readonly retryable = true;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CheckpointDbError";
  }
}

/**
 * Postgres 42P01 = relation does not exist. The `checkpoints` migration is
 * staged but only applied once the DB is reachable, so a missing table is a
 * legitimate "degrade to empty/none" — NOT a transient DB error to retry.
 */
function isTableMissing(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation .* does not exist/i.test(msg) || msg.includes("42P01");
}

export interface CreateCheckpointInput {
  siteId?: number | null;
  gate: string;
  title: string;
  summary?: string;
  payload?: Record<string, unknown>;
  blastRadius?: number;
}

export async function createCheckpoint(input: CreateCheckpointInput): Promise<Checkpoint | null> {
  try {
    const db = getDb();
    const [row] = await db
      .insert(checkpoints)
      .values({
        siteId: input.siteId ?? null,
        gate: input.gate,
        title: input.title,
        summary: input.summary ?? null,
        payload: input.payload ?? null,
        blastRadius: input.blastRadius ?? 0,
      })
      .returning();
    return row;
  } catch (e) {
    console.warn("createCheckpoint failed (table may not exist yet)", e);
    return null;
  }
}

export async function listCheckpoints(opts: { status?: string; siteId?: number } = {}): Promise<Checkpoint[]> {
  try {
    const db = getDb();
    const conds = [];
    if (opts.status) conds.push(eq(checkpoints.status, opts.status));
    if (opts.siteId) conds.push(eq(checkpoints.siteId, opts.siteId));
    const where = conds.length ? and(...conds) : undefined;
    return await db.select().from(checkpoints).where(where).orderBy(desc(checkpoints.id)).limit(100);
  } catch (e) {
    console.warn("listCheckpoints failed (table may not exist yet)", e);
    return [];
  }
}

export async function countPending(siteId?: number): Promise<number> {
  return (await listCheckpoints({ status: "pending", siteId })).length;
}

/**
 * Returns the checkpoint or `null` if it genuinely doesn't exist (no row, or
 * the table isn't migrated yet). A real DB error (e.g. a transient Neon blip)
 * is logged and rethrown as a retryable {@link CheckpointDbError} so a decision
 * doesn't silently masquerade as "not found".
 */
export async function getCheckpoint(id: number): Promise<Checkpoint | null> {
  try {
    const db = getDb();
    const [row] = await db.select().from(checkpoints).where(eq(checkpoints.id, id)).limit(1);
    return row ?? null;
  } catch (e) {
    if (isTableMissing(e)) {
      console.warn("getCheckpoint: checkpoints table missing (not migrated yet)", e);
      return null;
    }
    console.warn(`getCheckpoint: DB error for id=${id} (retryable)`, e);
    throw new CheckpointDbError(`Failed to read checkpoint ${id}`, { cause: e });
  }
}

export async function decideCheckpoint(
  id: number,
  verb: Verb,
  opts: { note?: string; actor?: string } = {},
): Promise<Checkpoint> {
  const db = getDb();
  const cp = await getCheckpoint(id);
  if (!cp) throw new CheckpointError("Checkpoint not found");
  if (!canDecide(cp.status as CheckpointStatus)) throw new CheckpointError(`Already ${cp.status}`);

  const next = applyVerb(cp.status as CheckpointStatus, verb);
  const [row] = await db
    .update(checkpoints)
    .set({ status: next, decision: verb, note: opts.note ?? null, decidedBy: opts.actor ?? "user", decidedAt: new Date() })
    .where(eq(checkpoints.id, id))
    .returning();

  // Audit-log terminal decisions (best-effort).
  if (verb === "approve" || verb === "reject" || verb === "edit") {
    try {
      await recordApproval({
        gate: cp.gate as "A" | "B" | "C" | "D" | "E",
        targetType: "change",
        targetId: cp.id,
        decision: toApprovalDecision(verb),
        note: opts.note,
        channel: "web",
      });
    } catch (e) {
      console.warn("decideCheckpoint: recordApproval failed (audit is best-effort)", e);
    }
  }

  // Notify Slack of the decision (best-effort; no-op without a slack integration).
  if (cp.siteId) {
    await notifySlackForSite(
      cp.siteId,
      `Checkpoint ${verb.toUpperCase()}: "${cp.title}"${opts.note ? ` — ${opts.note}` : ""}`,
    ).catch(() => {});
  }
  return row;
}
