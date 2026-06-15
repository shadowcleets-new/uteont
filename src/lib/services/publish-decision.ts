/**
 * Pure idempotent-publish decision logic (IP-07) — the core of receipt-based
 * publishing. Given the last persisted publish receipt for an article plus the
 * content hash + revision we want to push, decide whether to create a new remote
 * object, update the existing one, or do nothing (a replayed/stale delivery).
 *
 * Kept pure & dependency-free so the publish service + its tests need no DB or
 * network: the caller supplies the receipt and the desired hash/revision.
 */

// #region Types

/** The last known published state of an article (one row in the publish ledger). */
export interface PublishReceipt {
  articleId: number;
  /** Revision number that was live at the remote when this receipt was written. */
  revision: number;
  /** Content hash that was live at the remote when this receipt was written. */
  contentHash: string;
  /** Remote object id; null means "we have a receipt but nothing is live yet". */
  remoteId: string | null;
}

export type PublishAction = "noop" | "create" | "update";

// #endregion

// #region Decision

/**
 * Decide the publish action for an incoming delivery.
 *
 * @param receipt     Last persisted receipt for the article, or null/undefined if none.
 * @param contentHash Hash of the content we want live now.
 * @param revision    Revision number of the content we want live now.
 *
 * Rules:
 *  - No receipt, or receipt with no remoteId -> 'create' (nothing live yet).
 *  - Live receipt, incoming revision strictly older than the receipt -> 'noop'
 *    (stale/replayed older delivery; never regress a newer live object).
 *  - Live receipt, newer revision (revision > receipt.revision) -> 'update'
 *    (a fresh delivery; push it even if the hash happens to match).
 *  - Live receipt, same revision and identical contentHash -> 'noop'
 *    (already live with identical content; a replay must not duplicate).
 *  - Live receipt, same revision but different contentHash -> 'update'.
 */
export function decidePublishAction(
  receipt: PublishReceipt | null | undefined,
  contentHash: string,
  revision: number,
): PublishAction {
  // Nothing live yet -> create.
  if (!receipt || receipt.remoteId === null) return "create";

  // Stale/replayed older delivery -> never regress a newer live object.
  if (revision < receipt.revision) return "noop";

  // Strictly newer revision -> push to the same remoteId.
  if (revision > receipt.revision) return "update";

  // Same revision: already live with identical content -> replay-safe no-op.
  if (contentHash === receipt.contentHash) return "noop";

  // Same revision, changed content -> push the correction.
  return "update";
}

// #endregion
