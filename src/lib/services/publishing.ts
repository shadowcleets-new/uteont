/**
 * Idempotent publish decision (plan IP-07, pure part).
 *
 * Pure logic only: given the receipt of a prior publish and the hash of the
 * content we want live now, decide whether to create, update, or skip. No CMS
 * clients, no DB, no network, no clock — the caller injects everything.
 */

// #region Imports
import { createHash } from "node:crypto";
// #endregion

// #region Types
/**
 * Record of a previous publish to a single CMS target.
 * `remoteId` is null when the remote object's id is not (yet) known.
 */
export interface PublishReceipt {
  articleId: number;
  revision: number;
  targetId: string;
  contentHash: string;
  remoteId: string | null;
}

export type PublishAction = "noop" | "create" | "update";
// #endregion

// #region Public API
/**
 * Stable sha256 hex digest of the rendered content. Deterministic across
 * processes; differs for any byte-level change in the input.
 */
export function computeContentHash(content: string): string {
  // Coerce defensively: callers must pass a string, but a stray null/number
  // should not throw inside the hashing pipeline.
  const input = typeof content === "string" ? content : String(content ?? "");
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Decide the publish action for one target.
 *
 * - no prior receipt           => "create"
 * - stored hash === new hash    => "noop"   (already live, identical content)
 * - otherwise                   => "update" (content changed; reuse remoteId)
 *
 * `revision` is accepted for interface stability and audit logging; the
 * decision is driven by content identity, so an unchanged hash is a noop even
 * across revision bumps.
 */
export function decidePublishAction(
  receipt: PublishReceipt | null,
  contentHash: string,
  revision: number,
): PublishAction {
  void revision;
  if (!receipt) return "create";
  if (receipt.contentHash === contentHash) return "noop";
  return "update";
}
// #endregion
