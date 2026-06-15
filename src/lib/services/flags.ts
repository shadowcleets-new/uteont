/**
 * Feature flags (IP-36) — pure flag evaluation.
 *
 * The integrator wraps these pure functions around a `kv_settings` read: the
 * persisted blob is run through `normalizeFlags` (defensive coercion of an
 * unknown DB value), then individual gates are checked with `isFlagEnabled`.
 * The pure functions below touch no DB/network/clock/RNG, so their tests need no
 * DATABASE_URL. The DB-backed reader at the bottom (getFlags/isEnabled/setFlag)
 * wraps them around a defensive `kv_settings` read.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";

/** A flag is explicitly on/off, or absent (fall through to defaults). */
export type FlagMap = Record<string, boolean | undefined>;

/**
 * Ship-time defaults for flags with no persisted value. The moat
 * "intelligence_engine" ships behind a flag, default OFF, per the plan.
 */
export const FLAG_DEFAULTS: Record<string, boolean> = {
  intelligence_engine: false,
};

/**
 * Resolve a flag to a concrete boolean.
 * Precedence: explicit boolean in `flags` → FLAG_DEFAULTS[key] → false.
 * `null`/`undefined` flag maps are treated as "no overrides".
 */
export function isFlagEnabled(
  flags: FlagMap | null | undefined,
  key: string,
): boolean {
  const explicit = flags?.[key];
  if (typeof explicit === "boolean") return explicit;
  return FLAG_DEFAULTS[key] ?? false;
}

/**
 * Defensively coerce an unknown kv blob into a FlagMap. Only entries whose
 * value is a genuine JS boolean survive; anything else (non-object, array,
 * string, number, null) yields an empty map. This keeps a malformed or
 * tampered `kv_settings` payload from leaking truthy/falsy junk into gates.
 */
export function normalizeFlags(raw: unknown): FlagMap {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  const out: FlagMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

// --- DB-backed reader (kv_settings) --------------------------------------

const FLAGS_KEY = "feature_flags";

/** Read the persisted flag map. Defensive — missing table/row → {} (defaults). */
export async function getFlags(): Promise<FlagMap> {
  try {
    const db = getDb();
    const [row] = await db.select().from(kvSettings).where(eq(kvSettings.key, FLAGS_KEY)).limit(1);
    return normalizeFlags(row?.value);
  } catch (e) {
    console.warn("getFlags failed (kv_settings unavailable); using defaults", e);
    return {};
  }
}

/** Resolve a single gate against the persisted flags + ship-time defaults. */
export async function isEnabled(key: string): Promise<boolean> {
  return isFlagEnabled(await getFlags(), key);
}

/** Persist a single flag without a redeploy. Best-effort; returns success. */
export async function setFlag(key: string, value: boolean): Promise<boolean> {
  try {
    const db = getDb();
    const next = { ...(await getFlags()), [key]: value };
    await db
      .insert(kvSettings)
      .values({ key: FLAGS_KEY, value: next })
      .onConflictDoUpdate({ target: kvSettings.key, set: { value: next, updatedAt: new Date() } });
    return true;
  } catch (e) {
    console.warn("setFlag failed", e);
    return false;
  }
}
