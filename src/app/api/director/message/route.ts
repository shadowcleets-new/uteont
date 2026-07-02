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
import { createConversation, getConversation, getDirectorContext } from "@/lib/services/conversations";
import { runDirectorTurn } from "@/lib/services/director";
import { getActiveSiteId } from "@/lib/services/app-settings";

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
    // The Director always operates on the globally-selected site.
    const siteId = await getActiveSiteId();
    conversation = await createConversation({ surface: "web", siteId });
  }

  const { summary, recent } = await getDirectorContext(conversation.id);

  const { message, response } = await runDirectorTurn({
    conversation,
    history: recent,
    summary,
    newUserMessage: payload.text,
    surface: "web",
  });

  return NextResponse.json({
    conversationId: conversation.id,
    message,
    response,
  });
}
