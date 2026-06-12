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
 * A-15: the token is a high-entropy URL-safe string but is stored as a
 * SHA-256 HASH, never the raw value — so a DB/backup/log leak during the
 * 10-min TTL can't be replayed into an account takeover. The plaintext is
 * returned to the caller (for the URL) exactly once and never persisted.
 * Comparison on consume is constant-time (A-08).
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { authConfig } from "@/lib/db/schema";
import { setPassword } from "./auth-config";
import { safeEqual } from "@/lib/crypto/constant-time";
import { sha256Hex } from "@/lib/crypto/hash";

const ROW_ID = 1;
const TOKEN_BYTES = 32;
const TTL_MIN = 10;

export async function issueSetupToken(): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = sha256Hex(token); // A-15: persist only the hash
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
      .set({ setupToken: tokenHash, setupTokenExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(authConfig.id, ROW_ID));
  } else {
    await db.insert(authConfig).values({
      id: ROW_ID,
      setupToken: tokenHash,
      setupTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    });
  }
  // Return the plaintext to the caller for the one-time URL; it is never stored.
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
  // A-08/A-15: compare the hash of the presented token against the stored hash
  // in constant time.
  if (!safeEqual(row.setupToken, sha256Hex(token))) {
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
