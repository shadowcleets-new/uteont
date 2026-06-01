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
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const siteIdRaw = Number(new URL(req.url).searchParams.get("siteId") ?? "");
  const siteId = Number.isFinite(siteIdRaw) && siteIdRaw > 0 ? siteIdRaw : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const t0 = Date.now();
      const elapsed = () => Date.now() - t0;

      try {
        const agent = findAgent(key);
        if (!agent) {
          send("failed", { message: `Unknown agent: ${key}` });
          controller.close();
          return;
        }
        if (!agent.implemented) {
          send("failed", { message: `${agent.name} is not implemented yet.` });
          controller.close();
          return;
        }

        send("phase", { phase: "resolving", label: "Resolving site…", elapsedMs: elapsed() });
        const site = siteId ? await getSiteById(siteId).catch(() => null) : null;

        if (!hasInlineRunner(key)) {
          send("phase", { phase: "queued", label: `${agent.name} runs on the worker — queued for the next poll.`, elapsedMs: elapsed() });
          send("done", { ok: true, queued: true, elapsedMs: elapsed() });
          controller.close();
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

        // Best-effort persistence (no-op if the DB is unreachable).
        let runId: number | null = null;
        try {
          const r = await startRun({ subjectKey: `agent.${key}`, category: "agent", action: "stream", siteId: site?.id ?? 0 });
          runId = r?.id ?? null;
        } catch {
          /* DB down — stream anyway */
        }

        const runPromise = INLINE_RUNNERS[key]({ payload: { site: siteSnapshot } });
        let settled = false;
        runPromise.finally(() => { settled = true; }).catch(() => {});

        while (!settled) {
          await new Promise((res) => setTimeout(res, 400));
          send("tick", { elapsedMs: elapsed() });
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
        controller.close();
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
