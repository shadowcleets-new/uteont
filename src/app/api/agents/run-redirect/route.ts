import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/services/agents";

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
    await runAgent({ agentKey, siteId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const url = new URL(`/agents/${agentKey}?error=${encodeURIComponent(msg)}`, req.url);
    return NextResponse.redirect(url, 303);
  }
  const url = new URL(`/agents/${agentKey}?triggered=1`, req.url);
  return NextResponse.redirect(url, 303);
}
