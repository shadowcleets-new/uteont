/**
 * Lightweight structured logger for cost + latency observability.
 *
 * Emits one JSON line per event to stdout (captured by Vercel logs).
 * Zero dependencies, and NEVER throws into the caller — observability must
 * not be able to break the pipeline.
 */

export type LogEvent = {
  kind: string; // e.g. "model.call", "dedup.hit", "dedup.miss"
  traceId?: string;
  agentKey?: string;
  model?: string;
  task?: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  cached?: boolean;
  status?: "ok" | "error";
  [key: string]: unknown; // free-form extra fields
};

let _counter = 0;

/** Generate a short, unique-ish trace id for correlating a request's events. */
export function newTraceId(): string {
  _counter = (_counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `tr_${Date.now().toString(36)}${_counter.toString(36)}${rand}`;
}

/** Emit one structured event. Never throws. */
export function logEvent(event: LogEvent): void {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
    console.log(`[obs] ${line}`);
  } catch {
    // logging must never break the caller (e.g. circular refs)
  }
}

/**
 * Time an async function and emit one event with its duration. Logs
 * status "ok" | "error"; re-throws the original error so control flow
 * is unchanged.
 */
export async function timed<T>(
  meta: LogEvent,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const out = await fn();
    logEvent({ ...meta, durationMs: Date.now() - start, status: "ok" });
    return out;
  } catch (e) {
    logEvent({
      ...meta,
      durationMs: Date.now() - start,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
