/**
 * @file constant-time.ts
 * @description Edge-safe constant-time string comparison for secret checks.
 * Used by middleware (worker/cron/telegram bearer secrets, A-08), which runs
 * in the Edge runtime — so this is PURE JS with no node:crypto/Buffer imports.
 * For SHA-256 hashing (Node-runtime only) see ./hash.ts.
 */

/**
 * Constant-time equality for two secrets. Returns false (never throws) on
 * empty/undefined inputs. A length mismatch returns false but still scans the
 * longer input so the comparison time doesn't leak which side is longer; only
 * the final boolean differs. Never reveals WHICH byte differs.
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    // charCodeAt past the end is NaN; `| 0` coerces it to 0 deterministically.
    const ca = a.charCodeAt(i) | 0;
    const cb = b.charCodeAt(i) | 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}
