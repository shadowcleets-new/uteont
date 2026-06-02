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
    // payload so the inline runners (and worker handlers) receive them. Field
    // names match exactly what the runners/worker read.
    const payload: Record<string, unknown> = { site: siteSnapshot };
    const str = (k: string) => String(form.get(k) ?? "").trim();
    const list = (k: string) =>
      str(k)
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

    // Single-value string inputs, threaded verbatim when present.
    for (const k of [
      "url", "topic", "keyword", "article", "targetKeyword",
      "title", "brief", "targetSite", "ourValue", "context",
    ]) {
      const v = str(k);
      if (v) payload[k] = v;
    }
    // List inputs (newline/comma separated).
    const competitors = list("competitors");
    if (competitors.length) payload.competitors = competitors;
    const keywords = list("keywords");
    if (keywords.length) payload.keywords = keywords;
    const seeds = list("seeds");
    if (seeds.length) payload.seeds = seeds;

    await runAgent({ agentKey, siteId, payload });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const url = new URL(`/agents/${agentKey}?error=${encodeURIComponent(msg)}`, req.url);
    return NextResponse.redirect(url, 303);
  }
  const url = new URL(`/agents/${agentKey}?triggered=1`, req.url);
  return NextResponse.redirect(url, 303);
}
