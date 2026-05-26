/**
 * Telegram Bot API client. Sends messages with optional inline keyboards
 * for approve/reject flows.
 *
 * No-op (returns false) if TELEGRAM_BOT_TOKEN is unset, so the rest of
 * the system works before Telegram is configured.
 */

export interface InlineButton {
  text: string;
  callbackData: string;
}

export interface SendOptions {
  chatId?: string;
  text: string;
  buttons?: InlineButton[][];
  parseMode?: "Markdown" | "HTML";
}

export async function sendMessage(opts: SendOptions): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  const chatId = opts.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return false;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: opts.text,
    parse_mode: opts.parseMode ?? "Markdown",
  };

  if (opts.buttons && opts.buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: opts.buttons.map((row) =>
        row.map((b) => ({ text: b.text, callback_data: b.callbackData })),
      ),
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`telegram.sendMessage failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("telegram.sendMessage error", e);
    return false;
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (e) {
    console.error("telegram.answerCallbackQuery error", e);
  }
}
