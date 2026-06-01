import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/services/agents";
import { getSiteById } from "@/lib/services/sites";

/**
 * Form-friendly trigger for the Run button on the agent page.
 *
 * Accepts a urlencoded form with `agentKey`, runs the agent (inline or
 * enqueues for the worker), then redirects back to the agent page.
 * Intentionally simple — full client UI with progress lives in a later
 * iteration.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const agentKey = String(form.get("agentKey") || "");
  const siteIdRaw = form.get("siteId");
  if (!agentKey) {
    return NextResponse.json({ error: "agentKey required" }, { status: 400 });
  }
  const siteId = siteIdRaw ? Number(siteIdRaw) : NaN;
  if (!Number.isFinite(siteId) || siteId <= 0) {
    // Redirect back to the agent page with an error rather than silently
    // running against the default site. The UI button always supplies a
    // siteId, so reaching this path means the form was constructed wrong.
    const url = new URL(`/agents/${agentKey}?error=${encodeURIComponent("siteId required")}`, req.url);
    return NextResponse.redirect(url, 303);
  }
  try {
    const site = await getSiteById(siteId);
    if (!site) {
      const url = new URL(`/agents/${agentKey}?error=${encodeURIComponent("site not found")}`, req.url);
      return NextResponse.redirect(url, 303);
    }
    const siteSnapshot = {
      id: site.id, key: site.key, name: site.name, domain: site.domain, locale: site.locale,
      niche: site.niche, audience: site.audience, voiceGuide: site.voiceGuide,
      contentPillars: site.contentPillars, bannedPhrases: site.bannedPhrases,
    };

    // Optional per-agent inputs (see lib/agents/run-inputs.ts). Threaded into the
    // payload so the inline runners receive them.
    const payload: Record<string, unknown> = { site: siteSnapshot };
    const url = String(form.get("url") ?? "").trim();
    const topic = String(form.get("topic") ?? "").trim();
    const keyword = String(form.get("keyword") ?? "").trim();
    const competitors = String(form.get("competitors") ?? "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (url) payload.url = url;
    if (topic) payload.topic = topic;
    if (keyword) payload.keyword = keyword;
    if (competitors.length) payload.competitors = competitors;

    await runAgent({ agentKey, siteId, payload });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const url = new URL(`/agents/${agentKey}?error=${encodeURIComponent(msg)}`, req.url);
    return NextResponse.redirect(url, 303);
  }
  const url = new URL(`/agents/${agentKey}?triggered=1`, req.url);
  return NextResponse.redirect(url, 303);
}
