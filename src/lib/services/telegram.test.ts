import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMessage } from "./telegram";

// Regression for the production bug: /setpassword-url got no reply because the
// reply (a URL containing a base64url setup token with `_`) was sent with the
// default parse_mode=Markdown, so Telegram returned 400 "can't parse entities".
// Fix: plain text by default, parse_mode opt-in.

describe("telegram.sendMessage parse_mode handling", () => {
  const origToken = process.env.TELEGRAM_BOT_TOKEN;
  const origChat = process.env.TELEGRAM_CHAT_ID;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (origToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = origToken;
    if (origChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = origChat;
  });

  const sentBody = () => JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

  it("omits parse_mode by default so a URL/token with `_` never triggers 'can't parse entities'", async () => {
    const ok = await sendMessage({ chatId: "1", text: "https://x.app/setup/aB_cd-eF_gh" });
    expect(ok).toBe(true);
    expect(sentBody()).not.toHaveProperty("parse_mode");
  });

  it("honors an explicit parseMode for callers that format intentionally", async () => {
    await sendMessage({ chatId: "1", text: "*hi*", parseMode: "Markdown" });
    expect(sentBody().parse_mode).toBe("Markdown");
  });

  it("does not retry on a 4xx (bad payload won't recover)", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Request: can't parse entities", { status: 400 }));
    const ok = await sendMessage({ chatId: "1", text: "_oops_" });
    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
