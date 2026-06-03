/**
 * Agent dispatcher — given an agent key + payload, either:
 *   - run it inline (fn runtime) and record a Run row, or
 *   - enqueue a Job for the browser worker (worker runtime).
 */

import { findAgent } from "@/lib/agents/registry";
import { INLINE_RUNNERS, hasInlineRunner } from "@/lib/agent-runners";
import { startRun, finishRun } from "./runs";
import { dispatchAgentJob } from "./jobs";
import { assertAgentNotPaused } from "./agent-state";

export interface RunAgentResult {
  mode: "inline" | "enqueued" | "cached";
  runId?: number;
  jobId?: number;
  result?: Record<string, unknown>;
  cached?: boolean;
}

export async function runAgent(opts: {
  agentKey: string;
  siteId: number;       // required — propagated to runs + jobs
  payload?: Record<string, unknown>;
  cycleId?: number;
  forceFresh?: boolean;
}): Promise<RunAgentResult> {
  const spec = findAgent(opts.agentKey);
  if (!spec) throw new Error(`unknown agent '${opts.agentKey}'`);
  if (!spec.implemented) throw new Error(`agent '${opts.agentKey}' is not implemented yet`);
  await assertAgentNotPaused(opts.agentKey); // operator pause (Settings) blocks runs

  const payload = opts.payload ?? {};

  if (spec.runtime === "fn" && hasInlineRunner(opts.agentKey)) {
    const run = await startRun({
      subjectKey: `agent.${opts.agentKey}`,
      category: "agent",
      action: spec.name,
      siteId: opts.siteId,
      cycleId: opts.cycleId,
    });
    try {
      const runner = INLINE_RUNNERS[opts.agentKey];
      const { result } = await runner({ payload });
      await finishRun({ runId: run.id, status: "success", result });
      return { mode: "inline", runId: run.id, result };
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      await finishRun({ runId: run.id, status: "failure", error: err });
      throw e;
    }
  }

  // worker runtime — dispatch (dedup-aware)
  const dispatch = await dispatchAgentJob({
    agentKey: opts.agentKey,
    siteId: opts.siteId,
    payload,
    cycleId: opts.cycleId,
    forceFresh: opts.forceFresh,
  });
  if (dispatch.mode === "cached") {
    return { mode: "cached", runId: dispatch.runId, result: dispatch.result, cached: true };
  }
  return { mode: "enqueued", jobId: dispatch.job.id };
}
