import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { complete } from "./gemini";

const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
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
});
