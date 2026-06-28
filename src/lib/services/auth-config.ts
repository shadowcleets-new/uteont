/**
 * Single-row auth_config helpers — rotate creds via Telegram commands
 * without redeploys. Empty DB → no login possible (must set via /setuser
 * + /setpassword first).
 */

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db/client";
import { authConfig, type AuthConfig } from "@/lib/db/schema";

const ROW_ID = 1;

// OWASP 2025 recommends bcrypt cost 12+ for new applications.
const BCRYPT_COST = 12;

// Password complexity policy. Enforced in setPassword().
const PASSWORD_MIN_LENGTH = 12;
const FORBIDDEN_PASSWORDS = new Set([
  "password",
  "password1",
  "12345678",
  "qwerty123",
  "letmein123",
  "admin1234",
]);

function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 128) {
    return "Password is too long (max 128).";
  }
  if (FORBIDDEN_PASSWORDS.has(password.toLowerCase())) {
    return "Password is in the common-passwords block list.";
  }
  const checks = {
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  if (passed < 3) {
    return "Password must contain at least 3 of: lowercase, uppercase, digit, symbol.";
  }
  return null;
}

// Usernames are a single login handle, never a sentence. Restricting the
// charset (and rejecting spaces / '/') stops the /setuser + /setpassword
// command-chaining mistake from silently storing a whole command line as the
// username (which then never matches at login). Returns an error string, or
// null when the username is acceptable.
const USERNAME_RE = /^[A-Za-z0-9._@-]{1,64}$/;

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!trimmed) return "Username cannot be empty.";
  if (trimmed.length > 64) return "Username too long (max 64).";
  if (/\s/.test(trimmed)) {
    return "Username cannot contain spaces — did you accidentally chain a command like /setpassword on the same line?";
  }
  if (trimmed.includes("/")) {
    return "Username cannot contain '/' — did you accidentally chain another command?";
  }
  if (!USERNAME_RE.test(trimmed)) {
    return "Username may only contain letters, digits, and . _ - @";
  }
  return null;
}

// The Telegram alert sent whenever the password is set or reset, so an
// unauthorized reset (e.g. via a compromised Telegram) is immediately visible.
export function passwordChangeAlertText(): string {
  return (
    "⚠️ *UTEONT security alert*\n\n" +
    "Your account password was just changed.\n\n" +
    "If this wasn't you, your Telegram may be compromised — secure it and run " +
    "/setpassword-url to reset the password immediately."
  );
}

/**
 * Distinguishes "no row yet" (`null`) from "table missing / DB unreachable"
 * (`undefined`). Callers that only need the optional value should pass through
 * undefined as null; admin paths should surface the schema error loudly so the
 * silent-migration-drift incident (May 27 2026 — see GAPS_REPORT F-034) can't
 * recur unnoticed.
 */
export async function getAuthConfig(): Promise<AuthConfig | null | undefined> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(authConfig)
      .where(eq(authConfig.id, ROW_ID))
      .limit(1);
    return row ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // The specific Postgres error 42P01 means the table doesn't exist —
    // a migration-drift bug, not "no config yet". Surface it.
    if (/relation .* does not exist/i.test(msg) || msg.includes("42P01")) {
      console.error("[auth-config] SCHEMA MISSING — auth_config table not in DB. Run `npm run db:migrate`.");
      // returning undefined (vs null) lets admin paths detect schema issues
      return undefined;
    }
    console.warn("[auth-config.getAuthConfig] DB error:", msg);
    return null;
  }
}

/**
 * Single-row upsert via SELECT-then-UPDATE-or-INSERT.
 *
 * Avoids Drizzle's onConflictDoUpdate path which has been flaky against
 * the Neon HTTP driver in our setup. Two round trips instead of one;
 * fine for a low-volume admin command.
 */
async function upsert(
  fields: Partial<Pick<AuthConfig, "username" | "passwordHash" | "allowedGoogleEmail">>,
) {
  const db = getDb();
  const existing = await db
    .select({ id: authConfig.id })
    .from(authConfig)
    .where(eq(authConfig.id, ROW_ID))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(authConfig)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(authConfig.id, ROW_ID));
  } else {
    await db.insert(authConfig).values({
      id: ROW_ID,
      username: fields.username ?? null,
      passwordHash: fields.passwordHash ?? null,
      allowedGoogleEmail: fields.allowedGoogleEmail ?? null,
      updatedAt: new Date(),
    });
  }
}

export async function setUsername(username: string): Promise<void> {
  const error = validateUsername(username);
  if (error) throw new Error(error);
  await upsert({ username: username.trim() });
}

/**
 * Best-effort security alert on password change. Never throws into the caller
 * (a notification failure must not break a password reset) and is a no-op when
 * Telegram isn't configured.
 */
async function notifyPasswordChanged(): Promise<void> {
  try {
    const { sendMessage } = await import("./telegram");
    await sendMessage({ text: passwordChangeAlertText(), parseMode: "Markdown" });
  } catch (e) {
    console.warn("[auth-config] password-change alert failed", e);
  }
}

export async function setPassword(password: string): Promise<void> {
  const error = validatePassword(password);
  if (error) throw new Error(error);
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  await upsert({ passwordHash: hash });
  await notifyPasswordChanged();
}

export async function setAllowedGoogleEmail(email: string): Promise<void> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) throw new Error("not a valid email");
  await upsert({ allowedGoogleEmail: trimmed });
}

/**
 * Get the admin chat ID — DB-stored value takes precedence over
 * TELEGRAM_CHAT_ID env var (so it can be rotated without a redeploy).
 */
export async function getAdminChatId(): Promise<string | null> {
  const cfg = await getAuthConfig();
  if (cfg && cfg.adminChatId) return cfg.adminChatId;
  // cfg === undefined means schema missing — admin commands will be denied
  // by the chat-id comparison further up; env fallback still works.
  return process.env.TELEGRAM_CHAT_ID ?? null;
}

export async function setAdminChatId(chatId: string): Promise<void> {
  if (!/^-?\d+$/.test(chatId)) throw new Error("admin chat id must be a numeric string");
  const db = getDb();
  const existing = await db
    .select({ id: authConfig.id })
    .from(authConfig)
    .where(eq(authConfig.id, ROW_ID))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(authConfig)
      .set({ adminChatId: chatId, updatedAt: new Date() })
      .where(eq(authConfig.id, ROW_ID));
  } else {
    await db.insert(authConfig).values({
      id: ROW_ID,
      adminChatId: chatId,
      updatedAt: new Date(),
    });
  }
}

export async function clearAllCreds(): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ id: authConfig.id })
    .from(authConfig)
    .where(eq(authConfig.id, ROW_ID))
    .limit(1);
  const empty = {
    username: null,
    passwordHash: null,
    allowedGoogleEmail: null,
    updatedAt: new Date(),
  };
  if (existing.length > 0) {
    await db.update(authConfig).set(empty).where(eq(authConfig.id, ROW_ID));
  } else {
    await db.insert(authConfig).values({ id: ROW_ID, ...empty });
  }
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
  } catch (e) {
    // A malformed/corrupt stored hash throws here. Deny login (fail closed),
    // but surface it — a silent false would hide a broken credential row that
    // locks the admin out with no clue why.
    console.warn("[auth-config.verifyCredentials] bcrypt.compare threw (denying login)", e);
    return false;
  }
}

export async function isGoogleEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const cfg = await getAuthConfig();
  if (!cfg?.allowedGoogleEmail) return false;
  return cfg.allowedGoogleEmail === email.trim().toLowerCase();
}
