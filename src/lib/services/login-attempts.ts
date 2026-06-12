/**
 * Login attempt tracking + rate limiting (mitigates F-009 and F-010).
 *
 * Every credentials sign-in attempt writes a row. A-03: the lockout is keyed
 * by SOURCE IP — MAX_FAILURES_PER_IP failures from one IP in the trailing
 * window locks that IP only, so an anonymous attacker can no longer lock the
 * legitimate admin out of their own console. A generous MAX_FAILURES_GLOBAL
 * backstop still trips on a genuine distributed flood. When no IP is known
 * (header stripped) we fall back to the global counter.
 */

import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { loginAttempts } from "@/lib/db/schema";

const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_GLOBAL = 50;
const WINDOW_MIN = 15;

/**
 * Extract the client IP from forwarding headers. x-forwarded-for is a
 * comma-separated hop list; the first entry is the original client. Pure +
 * testable (A-10).
 */
export function parseClientIp(
  forwardedFor: string | null | undefined,
  realIp: string | null | undefined,
): string | null {
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  if (realIp && realIp.trim()) return realIp.trim();
  return null;
}

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
 * Returns true if sign-in is currently rate-limited for this source. A-03:
 * keyed by IP (MAX_FAILURES_PER_IP) so one attacker can't lock out the admin;
 * a global backstop (MAX_FAILURES_GLOBAL) still trips on a distributed flood.
 * When ipAddress is null (header stripped) only the global counter applies.
 */
export async function isLockedOut(ipAddress?: string | null): Promise<boolean> {
  try {
    const db = getDb();
    const since = new Date(Date.now() - WINDOW_MIN * 60_000);

    if (ipAddress) {
      const [perIp] = await db
        .select({ n: count() })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.success, false),
            eq(loginAttempts.ipAddress, ipAddress),
            gte(loginAttempts.createdAt, since),
          ),
        );
      if ((perIp?.n ?? 0) >= MAX_FAILURES_PER_IP) return true;
    }

    const [global] = await db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, since),
        ),
      );
    return (global?.n ?? 0) >= MAX_FAILURES_GLOBAL;
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
  maxFailuresPerIp: MAX_FAILURES_PER_IP,
  maxFailuresGlobal: MAX_FAILURES_GLOBAL,
  windowMinutes: WINDOW_MIN,
};
