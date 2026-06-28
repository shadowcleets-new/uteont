/**
 * One-time setup tokens for the password-via-URL flow (F-016).
 *
 * Flow:
 *   1. Operator sends /setpassword-url to the bot
 *   2. Bot calls issueSetupToken() → stores token + 10-min TTL on auth_config
 *   3. Bot replies with https://uteont.vercel.app/setup/<token>
 *   4. Operator opens URL → password form → POST /api/setup
 *   5. consumeSetupToken(token, password) validates + invalidates + hashes
 *
 * Token is a high-entropy URL-safe string. Stored as-is (single-row,
 * single-token table). Comparison is constant-time (crypto.timingSafeEqual)
 * to avoid a timing oracle on the stored token (N-18).
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { authConfig } from "@/lib/db/schema";
import { setPassword } from "./auth-config";

const ROW_ID = 1;
const TOKEN_BYTES = 32;
const TTL_MIN = 10;

/**
 * Constant-time string comparison for the setup token (N-18).
 *
 * timingSafeEqual throws on unequal-length buffers, which would itself
 * leak length via an early throw. We guard length first; an attacker can
 * already infer the token length (32 bytes → 43-char base64url), so the
 * length check is not a meaningful oracle, while the byte comparison —
 * the part that matters — stays constant-time.
 */
function tokensMatch(stored: string, provided: string): boolean {
  const a = Buffer.from(stored, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function issueSetupToken(): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MIN * 60_000);

  const db = getDb();
  const existing = await db
    .select({ id: authConfig.id })
    .from(authConfig)
    .where(eq(authConfig.id, ROW_ID))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(authConfig)
      .set({ setupToken: token, setupTokenExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(authConfig.id, ROW_ID));
  } else {
    await db.insert(authConfig).values({
      id: ROW_ID,
      setupToken: token,
      setupTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    });
  }
  return { token, expiresAt };
}

export async function consumeSetupToken(token: string, password: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({
      setupToken: authConfig.setupToken,
      setupTokenExpiresAt: authConfig.setupTokenExpiresAt,
    })
    .from(authConfig)
    .where(eq(authConfig.id, ROW_ID))
    .limit(1);

  if (!row?.setupToken || !row.setupTokenExpiresAt) {
    throw new Error("No setup link is currently active. Request a new one via Telegram.");
  }
  if (!tokensMatch(row.setupToken, token)) {
    throw new Error("This setup link is invalid.");
  }
  const expiresAt = new Date(row.setupTokenExpiresAt as unknown as string);
  if (expiresAt.getTime() < Date.now()) {
    throw new Error("This setup link has expired. Request a new one via Telegram.");
  }

  // Set the password (validates policy + hashes)
  await setPassword(password);

  // Invalidate the token so the same link can't be used twice
  await db
    .update(authConfig)
    .set({ setupToken: null, setupTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(authConfig.id, ROW_ID));
}

export const SETUP_TOKEN_TTL_MIN = TTL_MIN;

// Exported for unit testing the constant-time comparison (N-18).
export const __test__ = { tokensMatch };
