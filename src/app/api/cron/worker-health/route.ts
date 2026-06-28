import { NextResponse } from "next/server";
import { inArray, lt, and } from "drizzle-orm";
import { sendMessage } from "@/lib/services/telegram";
import { getDb } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";

/**
 * F-024: worker-health watchdog cron. The Python worker keeps its heartbeat
 * (`last_poll_at`) in-memory and exposes it over HTTP at `/health` (see
 * worker/worker.py). Nothing was monitoring that, so a hung worker stayed
 * silent until a queued job went stale.
 *
 * This cron detects a STALE worker and alerts via Telegram:
 *   1. Primary — if WORKER_HEALTH_URL is set, fetch the worker's /health and
 *      read `last_poll_at`. Alert if it's older than the threshold (or the
 *      endpoint is unreachable / malformed).
 *   2. Fallback — the worker writes no heartbeat to the DB, so when no health
 *      URL is configured we infer hang from the job queue: any job still
 *      `queued`/`claimed` whose timestamp is older than the threshold means the
 *      worker isn't draining (same signal as /api/admin/jobs).
 *
 * Threshold is env-tunable via WORKER_STALE_THRESHOLD_MIN (default 10 min).
 * Auth checked by middleware (CRON_SECRET).
 */
export async function GET() {
  const thresholdMin = Number(process.env.WORKER_STALE_THRESHOLD_MIN) || 10;
  const thresholdMs = thresholdMin * 60 * 1000;
  const now = Date.now();
  const healthUrl = process.env.WORKER_HEALTH_URL;

  let stale = false;
  let reason = "";
  let lastPollAt: string | null = null;
  let mode: "http" | "db" = healthUrl ? "http" : "db";

  if (healthUrl) {
    // --- Primary: probe the worker's /health endpoint directly. ---
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(healthUrl, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timer);
      if (!res.ok) {
        stale = true;
        reason = `worker /health returned HTTP ${res.status}`;
      } else {
        const snap = (await res.json()) as { last_poll_at?: string | null };
        lastPollAt = snap.last_poll_at ?? null;
        const pollMs = lastPollAt ? new Date(lastPollAt).getTime() : NaN;
        if (!lastPollAt || Number.isNaN(pollMs)) {
          stale = true;
          reason = "worker /health has no valid last_poll_at (worker may have just started or hung)";
        } else if (now - pollMs > thresholdMs) {
          stale = true;
          reason = `worker last polled ${Math.round((now - pollMs) / 60000)} min ago (threshold ${thresholdMin} min)`;
        }
      }
    } catch (e) {
      stale = true;
      reason = `worker /health unreachable: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    // --- Fallback: no heartbeat is persisted to the DB, so infer a hung
    //     worker from the job queue. A job sitting in queued/claimed past the
    //     threshold means the worker is not draining the queue. ---
    try {
      const db = getDb();
      const cutoff = new Date(now - thresholdMs);
      const stuck = await db
        .select({ id: jobs.id, status: jobs.status, createdAt: jobs.createdAt })
        .from(jobs)
        .where(and(inArray(jobs.status, ["queued", "claimed"]), lt(jobs.createdAt, cutoff)))
        .limit(1);
      if (stuck.length > 0) {
        stale = true;
        reason =
          `job #${stuck[0].id} stuck in "${stuck[0].status}" since ` +
          `${stuck[0].createdAt?.toISOString?.() ?? stuck[0].createdAt} ` +
          `(>${thresholdMin} min) — worker not draining the queue. ` +
          `Set WORKER_HEALTH_URL for a direct heartbeat probe.`;
      }
    } catch (e) {
      // DB unreachable is its own problem; don't false-alarm on it here.
      return NextResponse.json(
        { ok: false, mode, error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  let alerted = false;
  if (stale) {
    alerted = await sendMessage({
      text: `⚠️ UTEONT worker looks STALE.\n${reason}`,
    });
  }

  return NextResponse.json({
    ok: true,
    mode,
    stale,
    reason: reason || null,
    lastPollAt,
    thresholdMin,
    alerted,
  });
}
