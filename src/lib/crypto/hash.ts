/**
 * @file hash.ts
 * @description SHA-256 hashing (Node runtime). Imports node:crypto, so do NOT
 * import this from Edge-runtime code (middleware) — use ./constant-time.ts for
 * the edge-safe compare. Used by the setup-token flow (A-15 hash-at-rest).
 */

import { createHash } from "node:crypto";

/** SHA-256 hex digest of a string. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
