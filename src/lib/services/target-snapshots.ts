/**
 * target_snapshots persistence: record observed target values over time and read
 * them back as a chronological series for the trajectory sparkline.
 *
 * `captureSnapshots` is the opportunistic, debounced writer the dashboard +
 * targets page call on load — it never throws (telemetry, not critical path).
 */

import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { targetSnapshots, type TargetSnapshot } from "@/lib/db/schema";

/** Don't record more than one snapshot per target within this window. */
export const SNAPSHOT_DEBOUNCE_MS = 6 * 60 * 60 * 1000; // 6h

export async function recordSnapshot(targetId: number, value: number): Promise<TargetSnapshot> {
  const db = getDb();
  const [row] = await db.insert(targetSnapshots).values({ targetId, value }).returning();
  return row;
}

/** A single target's snapshots, oldest → newest. */
export async function listSnapshots(targetId: number, limit = 60): Promise<TargetSnapshot[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(targetSnapshots)
    .where(eq(targetSnapshots.targetId, targetId))
    .orderBy(desc(targetSnapshots.id))
    .limit(limit);
  return rows.reverse();
}

/** Snapshots for many targets at once, each series oldest → newest, keyed by targetId. */
export async function snapshotsByTarget(
  targetIds: number[],
  perTarget = 60,
): Promise<Map<number, TargetSnapshot[]>> {
  const map = new Map<number, TargetSnapshot[]>();
  if (targetIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select()
    .from(targetSnapshots)
    .where(inArray(targetSnapshots.targetId, targetIds))
    .orderBy(asc(targetSnapshots.id));
  for (const r of rows) {
    const arr = map.get(r.targetId) ?? [];
    arr.push(r);
    map.set(r.targetId, arr);
  }
  for (const [k, arr] of map) {
    if (arr.length > perTarget) map.set(k, arr.slice(-perTarget));
  }
  return map;
}

/**
 * Debounced, best-effort capture: insert a snapshot for each target only if its
 * newest snapshot is older than the debounce window. Accepts already-computed
 * values so callers don't recompute. Returns how many rows were written; never
 * throws.
 */
export async function captureSnapshots(
  rows: Array<{ id: number; value: number }>,
  nowMs: number = Date.now(),
): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    const db = getDb();
    const ids = rows.map((r) => r.id);
    const latest = await db
      .select({ targetId: targetSnapshots.targetId, capturedAt: targetSnapshots.capturedAt })
      .from(targetSnapshots)
      .where(inArray(targetSnapshots.targetId, ids))
      .orderBy(desc(targetSnapshots.id));

    const newestByTarget = new Map<number, number>();
    for (const r of latest) {
      if (!newestByTarget.has(r.targetId)) {
        newestByTarget.set(r.targetId, (r.capturedAt as Date).getTime());
      }
    }

    const due = rows.filter((r) => {
      const last = newestByTarget.get(r.id);
      return last === undefined || nowMs - last >= SNAPSHOT_DEBOUNCE_MS;
    });
    if (due.length === 0) return 0;

    await db.insert(targetSnapshots).values(due.map((r) => ({ targetId: r.id, value: r.value })));
    return due.length;
  } catch (e) {
    console.warn("captureSnapshots failed", e);
    return 0;
  }
}
