import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSiteById } from "@/lib/services/sites";
import { markIntegrationVerified } from "@/lib/services/integrations";
import { runPerformanceTracking } from "@/lib/agent-runners/performance-tracking";

/**
 * Live "Test connection" for the Google integrations. Reuses the exact same
 * code path the daily cron uses (runPerformanceTracking → real GSC/GA4 pull),
 * so a green test means the daily pull will work too. Degrades gracefully:
 * without OAuth secrets / encryption key it returns ok:false with the runner's
 * own explanatory note rather than throwing. On a successful GSC pull it stamps
 * lastVerifiedAt so the integrations table reflects reality.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const siteId = Number(body?.siteId);
  const kind = body?.kind === "ga4" ? "ga4" : "gsc";
  if (!Number.isInteger(siteId) || siteId <= 0) {
    return NextResponse.json({ ok: false, message: "Invalid site." }, { status: 400 });
  }

  const site = await getSiteById(siteId);
  const result = await runPerformanceTracking(siteId, site?.domain ?? undefined);

  if (kind === "gsc") {
    if (result.configured) {
      const verifiedAt = await markIntegrationVerified(siteId, "gsc").catch(() => null);
      return NextResponse.json({
        ok: true,
        message: `✓ Search Console live — ${result.clicks ?? 0} clicks, ${result.impressions ?? 0} impressions (last 28 days).`,
        verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
      });
    }
    return NextResponse.json({ ok: false, message: result.note ?? "Search Console is not returning data." });
  }

  // GA4 reuses the Search Console Google connection + the site's numeric property id.
  if (result.ga4Sessions !== undefined) {
    return NextResponse.json({
      ok: true,
      message: `✓ GA4 live — ${result.ga4Sessions} sessions, ${result.ga4Conversions ?? 0} conversions (last 28 days).`,
    });
  }
  if (!result.configured) {
    return NextResponse.json({
      ok: false,
      message: result.note ?? "Connect Search Console first — GA4 reuses that Google connection.",
    });
  }
  return NextResponse.json({
    ok: false,
    message: "Search Console works, but GA4 returned no data — check the numeric property id and that the Google account can access that GA4 property.",
  });
}
