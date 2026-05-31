import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { kvSettings, sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildConsentUrl } from "@/lib/integrations/gsc";

/**
 * Kicks off the Google Search Console OAuth flow for a site (from ?siteId, or
 * the active site). Redirects to Google's consent screen, or back to the
 * integrations page with an error if the server isn't configured.
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  const qSiteId = Number(new URL(req.url).searchParams.get("siteId") ?? "");
  let siteId: number | null = Number.isFinite(qSiteId) && qSiteId > 0 ? qSiteId : null;
  if (!siteId) {
    const [kv] = await db.select().from(kvSettings).where(eq(kvSettings.key, "ui.activeSiteId")).limit(1);
    siteId = kv ? (kv.value as { id: number | null }).id : null;
  }
  if (!siteId) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent("Select a site first")}`, req.url));
  }
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent("Site not found")}`, req.url));
  }
  const back = (m: string) =>
    NextResponse.redirect(new URL(`/sites/${site.key}/integrations?error=${encodeURIComponent(m)}`, req.url));

  const redirectUri = new URL("/api/integrations/gsc/callback", req.url).toString();
  const state = Buffer.from(JSON.stringify({ siteId })).toString("base64url");
  const consent = buildConsentUrl(redirectUri, state);
  if (!consent) return back("GOOGLE_OAUTH_CLIENT_ID is not configured on the server.");
  return NextResponse.redirect(consent);
}
