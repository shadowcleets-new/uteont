/**
 * GET  /api/director/conversations/[id] — returns messages for a conversation.
 * PATCH /api/director/conversations/[id] — rename ({title}) or archive ({status}).
 * Session-gated by middleware.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConversation, getMessages, updateConversation } from "@/lib/services/conversations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversationId = parseInt(id, 10);
  if (!Number.isFinite(conversationId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const messages = await getMessages(conversationId, 200);
  return NextResponse.json({ conversation, messages });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversationId = parseInt(id, 10);
  if (!Number.isFinite(conversationId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { title?: unknown; status?: unknown };
  const patch: { title?: string; status?: "active" | "archived" } = {};
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 120);
  if (body.status === "active" || body.status === "archived") patch.status = body.status;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update (title or status required)" }, { status: 400 });
  }
  if (!(await getConversation(conversationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await updateConversation(conversationId, patch);
  return NextResponse.json({ ok: true, ...patch });
}
