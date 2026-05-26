import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents/registry";

/**
 * GET /api/agents
 * Returns the agent registry. Static for now; future versions may merge
 * runtime status from the DB (last run, current status, etc.).
 */
export async function GET() {
  return NextResponse.json({ agents: AGENTS });
}
