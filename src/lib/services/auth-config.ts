/**
 * Single-row auth_config helpers — rotate creds via Telegram commands
 * without redeploys. Empty DB → no login possible (must set via /setuser
 * + /setpassword first).
 */

import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db/client";
import { authConfig, type AuthConfig } from "@/lib/db/schema";

const ROW_ID = 1;

export async function getAuthConfig(): Promise<AuthConfig | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(authConfig)
      .where(eq(authConfig.id, ROW_ID))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

async function upsert(
  fields: Partial<Pick<AuthConfig, "username" | "passwordHash" | "allowedGoogleEmail">>,
) {
  const db = getDb();
  await db
    .insert(authConfig)
    .values({ id: ROW_ID, ...fields, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: authConfig.id,
      set: { ...fields, updatedAt: new Date() },
    });
}

export async function setUsername(username: string): Promise<void> {
  const trimmed = username.trim();
  if (!trimmed) throw new Error("username cannot be empty");
  if (trimmed.length > 64) throw new Error("username too long (max 64)");
  await upsert({ username: trimmed });
}

export async function setPassword(password: string): Promise<void> {
  if (!password || password.length < 8) {
    throw new Error("password must be at least 8 characters");
  }
  const hash = await bcrypt.hash(password, 10);
  await upsert({ passwordHash: hash });
}

export async function setAllowedGoogleEmail(email: string): Promise<void> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) throw new Error("not a valid email");
  await upsert({ allowedGoogleEmail: trimmed });
}

export async function clearAllCreds(): Promise<void> {
  const db = getDb();
  await db
    .insert(authConfig)
    .values({
      id: ROW_ID,
      username: null,
      passwordHash: null,
      allowedGoogleEmail: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: authConfig.id,
      set: {
        username: sql`NULL`,
        passwordHash: sql`NULL`,
        allowedGoogleEmail: sql`NULL`,
        updatedAt: new Date(),
      },
    });
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const cfg = await getAuthConfig();
  if (!cfg || !cfg.username || !cfg.passwordHash) return false;
  if (username.trim() !== cfg.username) return false;
  try {
    return await bcrypt.compare(password, cfg.passwordHash);
  } catch {
    return false;
  }
}

export async function isGoogleEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const cfg = await getAuthConfig();
  if (!cfg?.allowedGoogleEmail) return false;
  return cfg.allowedGoogleEmail === email.trim().toLowerCase();
}
