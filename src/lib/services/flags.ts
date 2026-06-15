/**
 * Feature flags — a pure decision core plus one best-effort async DB reader.
 *
 * The pure half (`FLAG_DEFAULTS` + `isFlagEnabled`) has no I/O and is fully
 * deterministic, so callers can resolve flags from any already-loaded settings
 * blob without touching the DB. The async half (`getFlag`) reads the "flags"
 * row from kv_settings defensively: any error, a missing row, or a malformed
 * value degrades silently to the compiled-in default. It never throws.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";

// #region Defaults

/**
 * Compiled-in default state for every known flag. A flag absent here resolves
 * to `false` (see `defaultFor`). Keep this the single source of truth for which
 * flags exist and how they ship.
 */
export const FLAG_DEFAULTS: Record<string, boolean> = {
  intelligence_engine: false,
};

// #endregion

// #region Pure core

/**
 * Resolve a flag from an already-loaded settings record.
 *
 * Precedence: a real own boolean on `settings[key]` wins; otherwise fall back
 * to `FLAG_DEFAULTS[key]`, and finally to `false`. Non-boolean override values
 * (strings, numbers, null, objects) and inherited properties are ignored so a
 * malformed blob can never accidentally flip a flag.
 */
export function isFlagEnabled(
  settings: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  if (settings && Object.prototype.hasOwnProperty.call(settings, key)) {
    const raw = settings[key];
    if (typeof raw === "boolean") return raw;
  }
  return defaultFor(key);
}

// #endregion

// #region Defensive async reader

/**
 * Best-effort read of a single flag from the "flags" kv_settings row.
 *
 * The row's `value` is treated as a `Record<string, unknown>` and run through
 * the same pure resolver. On ANY failure — DB unprovisioned, query error,
 * missing row, or non-object value — it returns the compiled-in default.
 * Never throws.
 */
export async function getFlag(key: string): Promise<boolean> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(kvSettings)
      .where(eq(kvSettings.key, "flags"))
      .limit(1);

    const value = row?.value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return isFlagEnabled(value as Record<string, unknown>, key);
    }
  } catch (e) {
    // Degrade silently to the default; log detail server-side only.
    console.warn("flags: getFlag read failed", e);
  }
  return defaultFor(key);
}

// #endregion

// #region Helpers

/** The shipped default for a flag, or `false` when the flag is unknown. */
function defaultFor(key: string): boolean {
  return FLAG_DEFAULTS[key] ?? false;
}

// #endregion
