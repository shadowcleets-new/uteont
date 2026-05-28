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
  // Fall back to site id=1 (the default site) when the form doesn't supply siteId.
  const siteId = siteIdRaw ? Number(siteIdRaw) : 1;
  if (!agentKey) {
    return NextResponse.json({ error: "agentKey required" }, { status: 400 });
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
