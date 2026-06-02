/**
 * True only when a database error message UNAMBIGUOUSLY indicates a uniqueness
 * (duplicate-key) violation.
 *
 * Deliberately conservative: neon-http wraps a failed insert as a generic
 * `Failed query: insert into "sites" ...` for BOTH a real uniqueness violation
 * AND a transient connection failure (`fetch failed`). Matching that generic
 * wrapper would mis-report a DB outage to the user as "Site key already in
 * use", so this only matches explicit duplicate/unique signals. The caller
 * disambiguates the wrapped case with a follow-up existence check.
 */
export function looksLikeKeyConflict(msg: string): boolean {
  return /duplicate key|unique constraint|already exists|_key_unique|_unique_idx/i.test(msg);
}
