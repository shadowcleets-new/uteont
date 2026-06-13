/**
 * @file page-text.ts
 * @description Live-page fetch + text extraction for the QA / SEO-Optimization
 * agents' "review the live URL" mode (LO-04). SSRF-guarded via site-crawl's
 * isBlockedHost (loopback / RFC-1918 / link-local are refused). htmlToText is a
 * pure tag-stripper; the fetch is best-effort (returns null on any failure).
 */

import { safeFetch } from "./safe-fetch";

/** Strip HTML to readable text: drop script/style, remove tags, decode the
 *  common entities, collapse whitespace. Pure + tested. */
export function htmlToText(html: string): string {
  if (!html) return "";
  let text = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1") // tags between a word and its punctuation leave a stray space
    .trim();
}

/**
 * Fetch a public URL and return its extracted text, or null on failure /
 * blocked host. Used by the live QA/SEO mode.
 */
export async function fetchPageText(rawUrl: string, timeoutMs = 8000): Promise<string | null> {
  try {
    new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return null;
  }
  // safeFetch enforces the SSRF guard on the initial host AND every redirect hop
  // (and resolves DNS to catch rebinding). A blocked host throws — propagate
  // that so the caller surfaces "refused non-public host"; any other failure
  // (network, timeout, non-ok) stays best-effort null.
  let res: Response;
  try {
    res = await safeFetch(rawUrl, {
      timeoutMs,
      headers: { "User-Agent": "UTEONT-LiveReview/1.0 (+https://uteont.vercel.app)" },
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("refusing")) throw e;
    return null;
  }
  if (!res.ok) return null;
  return htmlToText(await res.text());
}
