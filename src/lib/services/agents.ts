/**
 * Agent dispatcher — given an agent key + payload, either:
 *   - run it inline (fn runtime) and record a Run row, or
 *   - enqueue a Job for the browser worker (worker runtime).
 */

import { findAgent } from "@/lib/agents/registry";
import { INLINE_RUNNERS, hasInlineRunner } from "@/lib/agent-runners";
import { startRun, finishRun } from "./runs";
import { enqueueJob } from "./jobs";

export interface RunAgentResult {
  mode: "inline" | "enqueued";
  runId?: number;
  jobId?: number;
  result?: Record<string, unknown>;
}

export async function runAgent(opts: {
  agentKey: string;
  payload?: Record<string, unknown>;
  cycleId?: number;
}): Promise<RunAgentResult> {
  const spec = findAgent(opts.agentKey);
  if (!spec) throw new Error(`unknown agent '${opts.agentKey}'`);
  if (!spec.implemented) throw new Error(`agent '${opts.agentKey}' is not implemented yet`);

  const payload = opts.payload ?? {};

  if (spec.runtime === "fn" && hasInlineRunner(opts.agentKey)) {
    const run = await startRun({
      subjectKey: `agent.${opts.agentKey}`,
      category: "agent",
      action: spec.name,
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

  // worker runtime — enqueue
  const job = await enqueueJob({
    agentKey: opts.agentKey,
    payload,
    cycleId: opts.cycleId,
  });
  return { mode: "enqueued", jobId: job.id };
}
