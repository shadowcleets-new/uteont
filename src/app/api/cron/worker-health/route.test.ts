import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// F-024: the worker-health cron must alert via Telegram when the worker is
// stale. We mock the telegram service (to assert the alert fires) and the db
// client (to drive the DB-fallback path) so the test never hits the network or
// a real database.

// vi.mock factories are hoisted above module-scope consts, so the mock state
// must live in vi.hoisted() to avoid a temporal-dead-zone ReferenceError.
const h = vi.hoisted(() => {
  const sendMessage = vi.fn(async () => true);
  // Chainable drizzle query stub: db.select().from().where().limit() -> rows.
  const state: { dbRows: unknown[] } = { dbRows: [] };
  const limit = vi.fn(async () => state.dbRows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { sendMessage, state, select };
});
vi.mock("@/lib/services/telegram", () => ({ sendMessage: h.sendMessage }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ select: h.select }) }));

import { GET } from "./route";

describe("GET /api/cron/worker-health", () => {
  const origUrl = process.env.WORKER_HEALTH_URL;
  const origThreshold = process.env.WORKER_STALE_THRESHOLD_MIN;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    h.sendMessage.mockClear();
    h.state.dbRows = [];
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.WORKER_STALE_THRESHOLD_MIN;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (origUrl === undefined) delete process.env.WORKER_HEALTH_URL;
    else process.env.WORKER_HEALTH_URL = origUrl;
    if (origThreshold === undefined) delete process.env.WORKER_STALE_THRESHOLD_MIN;
    else process.env.WORKER_STALE_THRESHOLD_MIN = origThreshold;
  });

  it("alerts when the worker's last_poll_at is older than the threshold (HTTP mode)", async () => {
    process.env.WORKER_HEALTH_URL = "http://worker.internal:8080/health";
    const stalePoll = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ last_poll_at: stalePoll }), { status: 200 }),
    );

    const res = await GET();
    const body = await res.json();

    expect(body.mode).toBe("http");
    expect(body.stale).toBe(true);
    expect(body.alerted).toBe(true);
    expect(h.sendMessage).toHaveBeenCalledTimes(1);
    expect(h.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringMatching(/STALE/) }),
    );
  });

  it("does NOT alert when the worker polled recently (HTTP mode)", async () => {
    process.env.WORKER_HEALTH_URL = "http://worker.internal:8080/health";
    const freshPoll = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ last_poll_at: freshPoll }), { status: 200 }),
    );

    const res = await GET();
    const body = await res.json();

    expect(body.stale).toBe(false);
    expect(body.alerted).toBe(false);
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it("alerts when the worker's /health is unreachable (HTTP mode)", async () => {
    process.env.WORKER_HEALTH_URL = "http://worker.internal:8080/health";
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET();
    const body = await res.json();

    expect(body.stale).toBe(true);
    expect(body.reason).toMatch(/unreachable/);
    expect(h.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("respects WORKER_STALE_THRESHOLD_MIN (HTTP mode)", async () => {
    process.env.WORKER_HEALTH_URL = "http://worker.internal:8080/health";
    process.env.WORKER_STALE_THRESHOLD_MIN = "60";
    const poll = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ last_poll_at: poll }), { status: 200 }),
    );

    const res = await GET();
    const body = await res.json();

    // 30 min < 60 min threshold -> not stale.
    expect(body.thresholdMin).toBe(60);
    expect(body.stale).toBe(false);
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it("falls back to the job queue and alerts on a stuck job when no health URL is set (DB mode)", async () => {
    delete process.env.WORKER_HEALTH_URL;
    h.state.dbRows = [
      { id: 42, status: "queued", createdAt: new Date(Date.now() - 30 * 60 * 1000) },
    ];

    const res = await GET();
    const body = await res.json();

    expect(body.mode).toBe("db");
    expect(body.stale).toBe(true);
    expect(body.reason).toMatch(/#42/);
    expect(h.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does NOT alert in DB mode when the queue is draining (no stuck jobs)", async () => {
    delete process.env.WORKER_HEALTH_URL;
    h.state.dbRows = [];

    const res = await GET();
    const body = await res.json();

    expect(body.mode).toBe("db");
    expect(body.stale).toBe(false);
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});
