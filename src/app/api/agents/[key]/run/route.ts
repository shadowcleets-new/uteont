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
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("unknown agent") ? 404
                 : msg.includes("not implemented") ? 501
                 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
