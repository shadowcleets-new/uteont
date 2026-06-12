import Link from "next/link";
import { AgentPipelineStepper } from "@/components/pipeline-stepper";
import {
  getMostRecentCycleId,
  getPipelineState,
} from "@/lib/pipeline/snapshot";
import { derivePipelineState } from "@/lib/pipeline/state";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ cycleId?: string }>;
}

const EMPTY_SNAPSHOT_STATE = derivePipelineState({
  cycleCreated: false,
  keywords: { researched: 0, total: 0, failing: false },
  ideas: { proposed: 0, approved: 0, total: 0, failing: false },
  articles: {
    draft: 0,
    qaPassed: 0,
    approvedOrLater: 0,
    total: 0,
    failing: false,
  },
  running: {
    research: false,
    idea: false,
    writing: false,
    qa: false,
    seo: false,
  },
});

export default async function PipelinePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const requestedId = sp.cycleId ? Number(sp.cycleId) : null;
  const cycleId = requestedId ?? (await getMostRecentCycleId());

  const state = cycleId ? await getPipelineState(cycleId) : EMPTY_SNAPSHOT_STATE;

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight">
          Pipeline
        </h1>
        {cycleId && (
          <Link
            href={`/runs?subject=agent.research`}
            className="text-[11px] text-[#9a988e] hover:text-[#d97757] underline tabular-nums"
          >
            cycle #{cycleId}
          </Link>
        )}
      </div>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        One linear sequence. Each agent hands off to the next as soon as its
        output lands. Failed steps show the last error on hover.
      </p>

      <AgentPipelineStepper state={state} className="mb-6" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {state.steps.map((s) => (
          <div
            key={s.key}
            className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
                {s.label.toUpperCase()}
              </div>
              <div
                className={
                  s.status === "completed"
                    ? "text-[10px] text-[#788c5d]"
                    : s.status === "running"
                      ? "text-[10px] text-[#d97757]"
                      : s.status === "failed"
                        ? "text-[10px] text-[#a33b2b]"
                        : "text-[10px] text-[#9a988e]"
                }
              >
                {s.status}
              </div>
            </div>
            <div className="text-[12px] text-[#6b6a64] font-serif">
              {s.detail ?? "Awaiting upstream output."}
            </div>
          </div>
        ))}
      </div>

      {!cycleId && (
        <div className="mt-6 rounded-[10px] border border-dashed border-[#cfccc1] bg-white px-6 py-10 text-center">
          <p className="text-[13px] text-[#6b6a64] font-serif italic">
            No cycles yet — start one from{" "}
            <Link
              href="/chat"
              className="text-[#d97757] underline decoration-[#cfccc1] hover:decoration-[#d97757]"
            >
              Director
            </Link>{" "}
            and the pipeline state will populate here.
          </p>
        </div>
      )}
    </div>
  );
}
