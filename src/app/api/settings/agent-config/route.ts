import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  DEFAULT_AGENT_CONFIG,
  getAgentConfig,
  setAgentConfig,
} from "@/lib/services/settings";

const PatchSchema = z.object({
  maxTokensPerRun: z.number().int().min(1000).max(500000).optional(),
  hourlyRateLimit: z.number().int().min(1).max(10000).optional(),
  model: z
    .enum([
      "claude-3-5-sonnet",
      "claude-3-7-sonnet",
      "claude-3-opus",
      "gemini-3-pro",
      "gemini-3-flash",
    ])
    .optional(),
  enforceCostGuardrail: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const config = await getAgentConfig();
  return NextResponse.json({ config, defaults: DEFAULT_AGENT_CONFIG });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const config = await setAgentConfig(parsed.data);
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
