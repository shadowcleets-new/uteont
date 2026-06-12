/**
 * @file constant-time.ts
 * @description Constant-time string comparison + SHA-256 hashing for secret
 * checks. Used by middleware (worker/cron/telegram bearer secrets, A-08) and
 * the setup-token flow (hash-at-rest + constant-time compare, A-08/A-15).
 */

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time equality for two secrets. Returns false (never throws) on
 * empty/undefined inputs or length mismatch. The length check is not itself
 * constant-time, but it only leaks length — never which bytes differ — which
 * is the property that matters for bearer-token comparison.
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** SHA-256 hex digest of a string. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
