import { describe, it, expect, vi, afterEach } from "vitest";
import { newTraceId, logEvent, timed } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("observability logger", () => {
  it("newTraceId returns unique ids with a tr_ prefix", () => {
    const a = newTraceId();
    const b = newTraceId();
    expect(a).toMatch(/^tr_/);
    expect(b).toMatch(/^tr_/);
    expect(a).not.toBe(b);
  });

  it("logEvent never throws, even on circular structures", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const circular: Record<string, unknown> = { kind: "test" };
    circular.self = circular;
    expect(() => logEvent(circular as never)).not.toThrow();
    spy.mockRestore();
  });

  it("timed returns the wrapped value and logs status ok with a duration", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const out = await timed({ kind: "unit.test" }, async () => 42);
    expect(out).toBe(42);
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain('"status":"ok"');
    expect(line).toContain('"durationMs"');
  });

  it("timed re-throws and logs status error", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      timed({ kind: "unit.test" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(String(spy.mock.calls[0][0])).toContain('"status":"error"');
    expect(String(spy.mock.calls[0][0])).toContain("boom");
  });
});
