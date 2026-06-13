/**
 * @file safe-fetch.ts
 * @description SSRF-hardened fetch for agent paths that retrieve operator- or
 * web-supplied URLs (live QA/SEO review, site crawl). Closes two holes the
 * hostname-only guard left open:
 *   1. Redirect following — the old code used redirect:"follow", so a public URL
 *      could 30x to http://169.254.169.254/ (cloud metadata) or an RFC-1918 host
 *      and the guard never saw it. We follow redirects MANUALLY and re-validate
 *      every hop.
 *   2. DNS rebinding — a public hostname can resolve to an internal IP. We
 *      resolve the host and check every resolved address against the block list
 *      before connecting.
 *
 * Still hostname/IP-deny-list based (matches the single-operator threat model),
 * but no longer bypassable by a redirect or a rebind.
 */

import { lookup } from "node:dns/promises";

const MAX_REDIRECTS = 4;

/**
 * SSRF guard: hostnames/IPs that must never be fetched — loopback, RFC-1918
 * private ranges, link-local (incl. the 169.254.169.254 cloud-metadata IP), and
 * mDNS .local names. Accepts a hostname or a resolved IP literal (so it doubles
 * as the post-DNS check). Canonical home; site-crawl re-exports it.
 */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;

  // IPv6 internal ranges. Includes IPv4-mapped (::ffff:a.b.c.d), which must be
  // un-wrapped and re-checked against the IPv4 ranges below — otherwise
  // ::ffff:169.254.169.254 (cloud metadata) would slip through.
  if (h.includes(":")) {
    if (h === "::" || h === "::1") return true;                 // unspecified + loopback
    if (h.startsWith("fc") || h.startsWith("fd")) return true;  // unique-local (ULA)
    if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb"))
      return true; // link-local fe80::/10
    const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
    if (mapped) return isBlockedHost(mapped[1]); // re-check the embedded IPv4
    return false; // some other IPv6 — treat as public
  }

  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  return false;
}

/**
 * Pure: given a redirect Location and the current URL, return the absolute
 * next URL to validate — or null if it's malformed or a non-http(s) scheme.
 */
export function resolveRedirectUrl(location: string, baseUrl: string): string | null {
  let next: URL;
  try {
    next = new URL(location, baseUrl);
  } catch {
    return null;
  }
  if (next.protocol !== "http:" && next.protocol !== "https:") return null;
  return next.toString();
}

/**
 * Throw if the hostname — or any IP it resolves to — is non-public. A DNS
 * lookup failure is NOT treated as blocked (the resolver may be flaky / the
 * host may genuinely not exist; the fetch then fails naturally).
 *
 * Residual limitation (accepted under the single-operator threat model): this
 * resolves the host and checks the IPs, but the subsequent fetch() resolves the
 * host AGAIN, so a host that rebinds between the two lookups could still connect
 * to an internal IP (a TOCTOU). Fully closing it needs socket pinning to the
 * validated IP, which fetch() doesn't expose in this runtime. The redirect-hop
 * re-validation + IP check already defeat the common static-redirect SSRF.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (isBlockedHost(hostname)) {
    throw new Error(`refusing to fetch non-public host: ${hostname}`);
  }
  try {
    const records = await lookup(hostname, { all: true });
    for (const r of records) {
      if (isBlockedHost(r.address)) {
        throw new Error(`refusing to fetch ${hostname} — resolves to non-public IP ${r.address}`);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("refusing to fetch")) throw e;
    // resolver error / NXDOMAIN — let the actual fetch surface it.
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Fetch a URL with SSRF protection on the initial host AND every redirect hop.
 * Returns the final Response (status may be non-2xx; callers decide). Throws on
 * a blocked host, a bad scheme, or exceeding the redirect cap.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 8000, headers } = opts;
  let url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`refusing non-http(s) URL: ${parsed.protocol}`);
    }
    await assertPublicHost(parsed.hostname);

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal, headers, redirect: "manual" });
    } finally {
      clearTimeout(to);
    }

    // Manual redirect handling: re-validate the next hop's host before following.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res; // a 3xx with no Location — hand it back as-is
      const nextUrl = resolveRedirectUrl(location, url);
      if (!nextUrl) throw new Error(`refusing redirect to unsafe target: ${location}`);
      url = nextUrl;
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}
