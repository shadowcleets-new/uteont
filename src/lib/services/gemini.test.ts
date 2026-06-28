import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { complete, GeminiError, __resetDailySpendForTests } from "./gemini";

const ORIGINAL_KEY = process.env.GEMINI_API_KEY;
const ORIGINAL_BUDGET = process.env.GEMINI_DAILY_BUDGET_USD;

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_DAILY_BUDGET_USD;
  __resetDailySpendForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_BUDGET === undefined) delete process.env.GEMINI_DAILY_BUDGET_USD;
  else process.env.GEMINI_DAILY_BUDGET_USD = ORIGINAL_BUDGET;
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("gemini client", () => {
  it("returns cachedTokens from usageMetadata and logs a model.call event", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
          totalTokenCount: 120,
          cachedContentTokenCount: 80,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await complete("hello", { task: "unit", traceId: "tr_x" });
    expect(res.text).toBe("hi");
    expect(res.usage?.cachedTokens).toBe(80);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("model.call");
    expect(logged).toContain('"cachedTokens":80');
  });

  it("sends cachedContent and omits systemInstruction when a cache handle is given", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    let sentBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(String(init.body));
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await complete("hello", {
      systemInstruction: "SYS",
      cachedContent: "cachedContents/abc",
    });
    expect(sentBody.cachedContent).toBe("cachedContents/abc");
    expect(sentBody.systemInstruction).toBeUndefined();
  });

  it("does not enforce a budget cap when GEMINI_DAILY_BUDGET_USD is unset (default behavior)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    // A single call here bills ~$0.0079 (10M prompt + 10M completion at list price);
    // with the cap unset it must still succeed.
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 10_000_000,
          candidatesTokenCount: 10_000_000,
          totalTokenCount: 20_000_000,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await complete("hello");
    expect(res.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws GeminiError once the daily budget cap is exceeded, before fetching", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    // gemini-flash-latest list price: $0.075/1M input + $0.3/1M output.
    // 10M prompt + 10M completion => $0.75 + $3.00 = $3.75 recorded per call.
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "spendy" }] }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 10_000_000,
          candidatesTokenCount: 10_000_000,
          totalTokenCount: 20_000_000,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Cap below a single call's cost: first call succeeds (cap not yet hit) and
    // records ~$3.75; the second call sees spend >= cap and is refused.
    process.env.GEMINI_DAILY_BUDGET_USD = "1.0";

    const first = await complete("hello");
    expect(first.text).toBe("spendy");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(complete("hello again")).rejects.toBeInstanceOf(GeminiError);
    // The cap is enforced before the network round-trip — no second fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
