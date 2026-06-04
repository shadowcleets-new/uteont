/**
 * POST /api/director/conversations — create a new conversation.
 *
 * Body (all optional):
 *   title?:   string
 *   goal?:    string
 *   surface?: "web" | "telegram" | "both"
 *   siteId?:  number   — pin to a specific site
 *
 * Returns: the created Conversation row (201).
 *
 * Session-gated by middleware.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/services/conversations";

/** GET /api/director/conversations?offset=&limit= — paginated recent list (load-more). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 20) || 20));
  const conversations = await listConversations(limit, { offset });
  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // body is optional — default to empty
  }

  const siteId =
    typeof body.siteId === "number" && Number.isFinite(body.siteId)
      ? body.siteId
      : null;

  const title =
    typeof body.title === "string" && body.title.trim().length > 0
      ? body.title.trim()
      : null;

  const goal =
    typeof body.goal === "string" && body.goal.trim().length > 0
      ? body.goal.trim()
      : null;

  const rawSurface = body.surface;
  const surface =
    rawSurface === "web" || rawSurface === "telegram" || rawSurface === "both"
      ? rawSurface
      : "web";

  const conv = await createConversation({ title, goal, surface, siteId });
  return NextResponse.json(conv, { status: 201 });
}
