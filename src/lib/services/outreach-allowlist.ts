/**
 * @file outreach-allowlist.ts
 * @description Outreach target-domain allowlist (LO-58 / audit A-07). Caps the
 * blast radius of an outreach/backlink dispatch: when the operator has set an
 * allowlist (kv_settings, via app-settings), a job targeting a domain not on it
 * is rejected before it reaches the worker. An empty allowlist allows all (the
 * operator hasn't opted in yet) so existing flows aren't broken.
 */

/** Normalize a URL or bare domain to a lowercase registrable host, or null. */
export function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  let host: string | null = null;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname || null;
  } catch {
    host = null;
  }
  if (!host) return null;
  host = host.replace(/^www\./, "");
  // A registrable host has at least one dot and no spaces.
  if (!host.includes(".") || /\s/.test(host)) return null;
  return host;
}

/**
 * True if a target is allowed. Empty allowlist → allow all. Otherwise the
 * target's domain must equal, or be a subdomain of, an allowlisted entry.
 */
export function isOutreachTargetAllowed(target: string, allowlist: string[]): boolean {
  if (!allowlist.length) return true;
  const domain = extractDomain(target);
  if (!domain) return false;
  return allowlist.some((entry) => {
    const allowed = extractDomain(entry) ?? entry.trim().toLowerCase();
    return domain === allowed || domain.endsWith(`.${allowed}`);
  });
}
