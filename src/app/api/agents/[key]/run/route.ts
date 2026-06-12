import { NextRequest, NextResponse } from "next/server";
import { RunAgentRequest } from "@/lib/validation/schemas";
import { runAgent } from "@/lib/services/agents";
import { getSiteById } from "@/lib/services/sites";

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { key } = await ctx.params;
  let parsed;
  try {
    parsed = RunAgentRequest.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }

  const site = await getSiteById(parsed.siteId);
  if (!site) {
    return NextResponse.json({ error: "site_not_found" }, { status: 404 });
  }

  const siteSnapshot = {
    id: site.id,
    key: site.key,
    name: site.name,
    domain: site.domain,
    locale: site.locale,
    niche: site.niche,
    audience: site.audience,
    voiceGuide: site.voiceGuide,
    contentPillars: site.contentPillars,
    bannedPhrases: site.bannedPhrases,
  };

  // Strip any client-supplied _directorContext: only the Director sets that
  // (server-side, via dispatchAgentJob) to route a job result back into a
  // conversation. Accepting it from an arbitrary authenticated caller would let
  // them inject a forged "job-completed" message into someone else's thread.
  const clientPayload: Record<string, unknown> = { ...(parsed.payload ?? {}) };
  delete clientPayload._directorContext;
  const enhancedPayload = { ...clientPayload, site: siteSnapshot };

  try {
    const result = await runAgent({
      agentKey: key,
      siteId: site.id,
      payload: enhancedPayload,
      cycleId: parsed.cycleId,
      forceFresh: parsed.forceFresh,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    // A-12: only surface the expected, non-sensitive messages (unknown agent /
    // not implemented). Genericize everything else and log it server-side.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unknown agent")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("not implemented")) {
      return NextResponse.json({ error: msg }, { status: 501 });
    }
    console.error("[api] agent run failed", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
