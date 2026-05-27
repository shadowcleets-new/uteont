/**
 * Login attempt tracking + rate limiting (mitigates F-009 and F-010).
 *
 * Every credentials sign-in attempt writes a row. New attempts are
 * blocked if there have been MAX_FAILURES failures in the trailing
 * WINDOW_MIN minutes from any source (single-user app, so we don't
 * key on IP — the whole login path is throttled).
 */

import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { loginAttempts } from "@/lib/db/schema";

const MAX_FAILURES_PER_WINDOW = 10;
const WINDOW_MIN = 15;

export async function recordAttempt(
  username: string,
  success: boolean,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(loginAttempts).values({
      username: username.slice(0, 64),
      success,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent?.slice(0, 500) ?? null,
    });
  } catch (e) {
    // Audit-log failure must not block sign-in flow.
    console.warn("[login-attempts] failed to record attempt", e);
  }
}

/**
 * Returns true if the login path is currently rate-limited
 * (i.e. >= MAX_FAILURES_PER_WINDOW failures in the last WINDOW_MIN minutes).
 */
export async function isLockedOut(): Promise<boolean> {
  try {
    const db = getDb();
    const since = new Date(Date.now() - WINDOW_MIN * 60_000);
    const [row] = await db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, since),
        ),
      );
    return (row?.n ?? 0) >= MAX_FAILURES_PER_WINDOW;
  } catch (e) {
    console.warn("[login-attempts] failed to check lockout", e);
    return false; // fail-open on DB error (don't lock everyone out)
  }
}

/**
 * Cleanup older than 30 days — called from the daily cron.
 */
export async function purgeOldAttempts(): Promise<number> {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const result = await db
      .delete(loginAttempts)
      .where(sql`${loginAttempts.createdAt} < ${cutoff}`);
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  } catch (e) {
    console.warn("[login-attempts] purge failed", e);
    return 0;
  }
}

export const RATE_LIMIT_INFO = {
  maxFailures: MAX_FAILURES_PER_WINDOW,
  windowMinutes: WINDOW_MIN,
};
