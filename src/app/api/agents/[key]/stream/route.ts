import { NextRequest } from "next/server";
import { findAgent } from "@/lib/agents/registry";
import { INLINE_RUNNERS, hasInlineRunner } from "@/lib/agent-runners";
import { getSiteById } from "@/lib/services/sites";
import { startRun, finishRun } from "@/lib/services/runs";

/**
 * Server-Sent-Events stream for a single agent run (LO-22).
 *
 * Emits live phase + heartbeat events while an inline (fn-runtime) agent runs,
 * then the final result — so the agent page can show a streaming log with a
 * ticking elapsed clock instead of a point-in-time refresh. Worker-runtime
 * agents stream a "queued" notice. Persistence is best-effort (degrades when the
 * DB is down); the stream itself always works.
 *
 * Event types: `phase`, `tick`, `result`, `error`, `done`.
 *
 * The stream is bounded: it ends when the client disconnects (`req.signal`
 * aborts), when the per-request time cap (`MAX_STREAM_MS`) elapses, or when the
 * run settles — whichever comes first. `controller.close()` is guarded by a
 * `closed` flag so it is invoked exactly once even across these paths.
 */
const MAX_STREAM_MS = 5 * 60_000; // hard cap so a stuck run can't stream forever
const TICK_MS = 400;

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const siteIdRaw = Number(new URL(req.url).searchParams.get("siteId") ?? "");
  const siteId = Number.isFinite(siteIdRaw) && siteIdRaw > 0 ? siteIdRaw : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Guard so close() runs exactly once (calling it twice throws) and so a
      // post-abort enqueue() can't crash the handler.
      let closed = false;
      const closeOnce = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed/errored by the runtime on client abort */
        }
      };
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller closed underneath us (client gone) — stop emitting.
          closed = true;
        }
      };
      const t0 = Date.now();
      const elapsed = () => Date.now() - t0;
      // True once the client disconnects; checked in the tick loop and early exits.
      const aborted = () => req.signal.aborted || closed;

      try {
        const agent = findAgent(key);
        if (!agent) {
          send("failed", { message: `Unknown agent: ${key}` });
          return;
        }
        if (!agent.implemented) {
          send("failed", { message: `${agent.name} is not implemented yet.` });
          return;
        }

        send("phase", { phase: "resolving", label: "Resolving site…", elapsedMs: elapsed() });
        const site = siteId ? await getSiteById(siteId).catch(() => null) : null;

        if (!hasInlineRunner(key)) {
          send("phase", { phase: "queued", label: `${agent.name} runs on the worker — queued for the next poll.`, elapsedMs: elapsed() });
          send("done", { ok: true, queued: true, elapsedMs: elapsed() });
          return;
        }

        const siteSnapshot = site
          ? {
              id: site.id, key: site.key, name: site.name, domain: site.domain, locale: site.locale,
              niche: site.niche, audience: site.audience, voiceGuide: site.voiceGuide,
              contentPillars: site.contentPillars, bannedPhrases: site.bannedPhrases,
            }
          : {};

        send("phase", { phase: "running", label: `Running ${agent.name}…`, elapsedMs: elapsed() });

        // Best-effort persistence (no-op if the DB is unreachable). Only start a
        // run when we resolved a real site — startRun rejects siteId 0, which
        // previously made every site-less stream silently skip persistence.
        let runId: number | null = null;
        if (site) {
          try {
            const r = await startRun({ subjectKey: `agent.${key}`, category: "agent", action: "stream", siteId: site.id });
            runId = r?.id ?? null;
          } catch {
            /* DB down — stream anyway */
          }
        }

        const runPromise = INLINE_RUNNERS[key]({ payload: { site: siteSnapshot } });
        let settled = false;
        runPromise.finally(() => { settled = true; }).catch(() => {});

        // Tick until the run settles, the client disconnects, or the time cap is
        // hit — never an unbounded loop. The cap also stops ticking if a runner
        // hangs forever (its result promise is then orphaned, not awaited).
        while (!settled && !aborted() && elapsed() < MAX_STREAM_MS) {
          await new Promise((res) => setTimeout(res, TICK_MS));
          send("tick", { elapsedMs: elapsed() });
        }

        // Client gone: stop without emitting more; finally closes once.
        if (aborted()) return;

        // Time cap reached while the run is still going: surface it and bail
        // rather than awaiting a promise that may never resolve.
        if (!settled) {
          send("failed", { message: `Stream timed out after ${MAX_STREAM_MS}ms`, elapsedMs: elapsed() });
          if (runId) await finishRun({ runId, status: "failure", error: "stream_timeout" }).catch(() => {});
          return;
        }

        try {
          const out = await runPromise; // already settled
          const res = (out?.result ?? {}) as Record<string, unknown>;
          const score = typeof res.score === "number" ? res.score : undefined;
          send("result", { result: res, score, elapsedMs: elapsed() });
          if (runId) await finishRun({ runId, status: "success", result: res }).catch(() => {});
          send("done", { ok: true, elapsedMs: elapsed() });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          send("failed", { message, elapsedMs: elapsed() });
          if (runId) await finishRun({ runId, status: "failure", error: message }).catch(() => {});
        }
      } catch (e) {
        send("failed", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        closeOnce();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
