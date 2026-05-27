/** GET /api/director/conversations/[id] — returns messages for a conversation. */

import { NextRequest, NextResponse } from "next/server";
import { getConversation, getMessages } from "@/lib/services/conversations";

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
