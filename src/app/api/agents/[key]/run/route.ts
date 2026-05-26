import { NextRequest, NextResponse } from "next/server";
import { RunAgentRequest } from "@/lib/validation/schemas";
import { runAgent } from "@/lib/services/agents";

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

  try {
    const result = await runAgent({
      agentKey: key,
      payload: parsed.payload,
      cycleId: parsed.cycleId,
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
