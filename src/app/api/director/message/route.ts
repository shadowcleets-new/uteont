/**
 * POST /api/director/message
 *
 * Body: { conversationId?: number, text: string }
 *   - If conversationId omitted, creates a new conversation
 *   - text is the user's message
 *
 * Returns: { conversationId, message: { ... }, response: DirectorResponse }
 *
 * Session-gated by middleware.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createConversation, getConversation, getMessages } from "@/lib/services/conversations";
import { runDirectorTurn } from "@/lib/services/director";

const BodySchema = z.object({
  conversationId: z.number().int().positive().optional(),
  text: z.string().min(1).max(8000),
});

export async function POST(req: NextRequest) {
  let payload: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    payload = BodySchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid body", detail: String(e) },
      { status: 400 },
    );
  }

  let conversation = payload.conversationId
    ? await getConversation(payload.conversationId)
    : null;

  if (!conversation) {
    conversation = await createConversation({ surface: "web" });
  }

  const history = await getMessages(conversation.id, 60);

  const { message, response } = await runDirectorTurn({
    conversation,
    history,
    newUserMessage: payload.text,
    surface: "web",
  });

  return NextResponse.json({
    conversationId: conversation.id,
    message,
    response,
  });
}
