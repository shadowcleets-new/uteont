import { NextRequest, NextResponse } from "next/server";
import { answerCallbackQuery, sendMessage } from "@/lib/services/telegram";

/**
 * Telegram webhook receiver. Verified upstream by middleware.ts (which
 * checks X-Telegram-Bot-Api-Secret-Token).
 *
 * v1: handles inline-keyboard callback queries with payloads like
 *   `approve:<gate>:<targetType>:<targetId>`
 *   `reject:<gate>:<targetType>:<targetId>`
 * Plain text messages are acknowledged but not interpreted yet.
 */
export async function POST(req: NextRequest) {
  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const cb = update.callback_query as Record<string, unknown> | undefined;
  if (cb && typeof cb.data === "string" && typeof cb.id === "string") {
    const data = cb.data;
    await answerCallbackQuery(cb.id, "Received");
    // Acknowledge to user via a follow-up message; the actual approval
    // recording happens via /api/approvals which the bot logic will call.
    const message = cb.message as Record<string, unknown> | undefined;
    const chat = message?.chat as Record<string, unknown> | undefined;
    const chatId = chat ? String(chat.id) : undefined;
    if (chatId) {
      await sendMessage({
        chatId,
        text: `Action received: \`${data}\``,
        parseMode: "Markdown",
      });
    }
    return NextResponse.json({ ok: true, handled: "callback_query", data });
  }

  // Plain message — ack only
  return NextResponse.json({ ok: true, handled: "ignored" });
}
