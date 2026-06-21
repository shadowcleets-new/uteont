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

/**
 * Send a Telegram message. F-028: retries up to 3x on transient failure
 * (5xx, network errors). Returns true iff one of the attempts succeeds.
 * Returns false silently when bot token / chat id is missing — callers
 * already treat that as "not configured".
 */
export async function sendMessage(opts: SendOptions): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  const chatId = opts.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return false;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: opts.text,
  };
  // Plain text by DEFAULT — parse_mode is opt-in. Telegram's Markdown/HTML
  // parsers reject with 400 "can't parse entities" on arbitrary content: URLs
  // with underscores (e.g. the base64url /setpassword-url setup token), LLM/
  // Director output, keyword names. Command + Director replies pass no
  // parseMode and so go out as plain text and always deliver. Callers that
  // format intentionally (notify-job, password-change alert, callback ack)
  // pass parseMode explicitly and are unaffected.
  if (opts.parseMode) body.parse_mode = opts.parseMode;

  if (opts.buttons && opts.buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: opts.buttons.map((row) =>
        row.map((b) => ({ text: b.text, callback_data: b.callbackData })),
      ),
    };
  }

  // Retry on 5xx + transient network errors. 4xx errors (bad chat_id,
  // banned, parse error) won't recover with a retry — return false fast.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
      const text = await res.text();
      // 4xx: don't retry, the payload is wrong.
      if (res.status < 500) {
        console.error(`telegram.sendMessage 4xx (no retry): ${res.status} ${text}`);
        return false;
      }
      console.warn(`telegram.sendMessage 5xx attempt ${attempt}: ${res.status} ${text}`);
    } catch (e) {
      console.warn(`telegram.sendMessage network error attempt ${attempt}:`, e);
    }
    if (attempt < MAX_ATTEMPTS) {
      // 250ms, 1s, 4s
      await new Promise((r) => setTimeout(r, 250 * 4 ** (attempt - 1)));
    }
  }
  return false;
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
