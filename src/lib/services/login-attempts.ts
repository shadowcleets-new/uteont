/**
 * Login attempt tracking + rate limiting (mitigates F-009, F-010, N-10).
 *
 * Every credentials sign-in attempt writes a row. New attempts are
 * blocked if there have been MAX_FAILURES failures in the trailing
 * WINDOW_MIN minutes from any source (single-user app, so we don't
 * key on IP — the whole login path is throttled).
 *
 * N-10 hardening — the lockout must not become a self-inflicted DoS:
 *   1. A *correct* password is never blocked by the lockout. The caller
 *      verifies credentials FIRST; the lockout only gates *failed*
 *      attempts, so an attacker's wrong-password flood can never lock
 *      the real operator out.
 *   2. Only failures *since the last successful login* count toward the
 *      threshold — a success forgives/clears the window.
 *   3. Failures stop being counted once they age out of WINDOW_MIN, so
 *      the lockout actually expires over time.
 *   4. The caller must NOT record a fresh failure while already locked
 *      out (stops the counter self-amplifying indefinitely).
 */

import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { loginAttempts } from "@/lib/db/schema";

const MAX_FAILURES_PER_WINDOW = 10;
const WINDOW_MIN = 15;

// #region N-10 pure lockout policy (DB-free, unit-testable)

export interface AttemptRow {
  success: boolean;
  createdAt: Date;
}

/**
 * Pure lockout decision. Given the recent attempt history (newest-first
 * or any order), decides whether further *failed* attempts are throttled.
 *
 * Counts only failures that (a) fall inside the trailing window AND
 * (b) happened after the most recent success. A success therefore
 * forgives the window, and stale failures age out — the two properties
 * that stop the lockout from being a permanent DoS.
 */
export function isLockedOutFromHistory(
  attempts: ReadonlyArray<AttemptRow>,
  now: Date = new Date(),
  maxFailures: number = MAX_FAILURES_PER_WINDOW,
  windowMin: number = WINDOW_MIN,
): boolean {
  const windowStart = now.getTime() - windowMin * 60_000;
  const lastSuccessAt = attempts
    .filter((a) => a.success)
    .reduce((max, a) => Math.max(max, a.createdAt.getTime()), -Infinity);

  const relevantFailures = attempts.filter(
    (a) =>
      !a.success &&
      a.createdAt.getTime() >= windowStart &&
      a.createdAt.getTime() > lastSuccessAt,
  ).length;

  return relevantFailures >= maxFailures;
}

// #endregion

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
 * Returns true if *failed* logins are currently rate-limited — i.e. there
 * have been >= MAX_FAILURES_PER_WINDOW failures in the last WINDOW_MIN
 * minutes *since the last successful login*.
 *
 * Scoping the count to "since the last success" is what makes a correct
 * password forgive the window (N-10): once the operator gets in, the
 * attacker's prior failures no longer count. Stale failures also age out
 * of the window, so a finite flood does not lock the path forever.
 */
export async function isLockedOut(): Promise<boolean> {
  try {
    const db = getDb();
    const since = new Date(Date.now() - WINDOW_MIN * 60_000);

    // Most recent successful login inside the window (if any).
    const [lastSuccess] = await db
      .select({ at: loginAttempts.createdAt })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.success, true),
          gte(loginAttempts.createdAt, since),
        ),
      )
      .orderBy(desc(loginAttempts.createdAt))
      .limit(1);

    // Failures only count if newer than that success (and within window).
    const failuresSince = lastSuccess?.at ?? since;
    const [row] = await db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, failuresSince),
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
