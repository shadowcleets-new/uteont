import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { sites, siteIntegrations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { exchangeCodeForTokens } from "@/lib/integrations/gsc";
import { createIntegration, updateIntegration } from "@/lib/services/integrations";

/**
 * Google OAuth callback: exchanges the code for a refresh token and stores it
 * (encrypted) as the site's `gsc` integration, then returns to the integrations
 * page. Every failure path redirects back with a readable ?error= message.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const googleErr = url.searchParams.get("error");

  let siteId: number | null = null;
  try {
    if (stateRaw) {
      const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")) as { siteId?: number };
      siteId = Number(parsed.siteId) || null;
    }
  } catch {
    siteId = null;
  }

  const db = getDb();
  const [site] = siteId ? await db.select().from(sites).where(eq(sites.id, siteId)).limit(1) : [];
  const back = (q: string) =>
    NextResponse.redirect(new URL(`/sites/${site?.key ?? ""}/integrations?${q}`, req.url));

  if (googleErr) return back(`error=${encodeURIComponent(`Google: ${googleErr}`)}`);
  if (!code || !siteId || !site) return back(`error=${encodeURIComponent("Missing authorization code or site context.")}`);

  const redirectUri = new URL("/api/integrations/gsc/callback", req.url).toString();
  const tokens = await exchangeCodeForTokens(code, redirectUri);
  if (!tokens.refreshToken) {
    return back(`error=${encodeURIComponent("Google did not return a refresh token. Remove the app's access in your Google account, then reconnect.")}`);
  }

  try {
    const [existing] = await db
      .select()
      .from(siteIntegrations)
      .where(and(eq(siteIntegrations.siteId, siteId), eq(siteIntegrations.kind, "gsc")))
      .limit(1);
    const config = { refreshToken: tokens.refreshToken, propertyUrl: site.domain };
    if (existing) await updateIntegration(existing.id, { config });
    else await createIntegration(siteId, { kind: "gsc", label: "Google Search Console", config });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to store credentials (is CONNECTION_ENCRYPTION_KEY set?)";
    return back(`error=${encodeURIComponent(msg)}`);
  }

  return back("connected=gsc");
}
