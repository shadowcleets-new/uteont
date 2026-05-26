import { notFound } from "next/navigation";
import { findAgent, AGENTS } from "@/lib/agents/registry";
import { exportTargetFor } from "@/lib/agents/export-mapping";
import { StatusPill } from "@/components/status-pill";
import { ExportButton } from "@/components/export-button";

export function generateStaticParams() {
  return AGENTS.map((a) => ({ key: a.key }));
}

interface PageProps {
  params: Promise<{ key: string }>;
}

export default async function AgentPage({ params }: PageProps) {
  const { key } = await params;
  const agent = findAgent(key);
  if (!agent) notFound();

  const pill = agent.implemented ? "Idle" : "Planned";
  const exportTarget = exportTargetFor(agent);

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <div className="flex items-start justify-between gap-4 mb-3">
        <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight">
          {agent.name}
        </h1>
        <StatusPill state={pill} />
      </div>

      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        {agent.description}
      </p>

      <div className="flex gap-3 mb-6 items-center">
        <button
          disabled={!agent.implemented}
          className="rounded-md bg-[#d97757] text-white px-4 py-2 text-sm font-medium hover:bg-[#c66948] disabled:bg-[#f3f1ea] disabled:text-[#9a988e] disabled:cursor-not-allowed transition-colors"
        >
          Run agent
        </button>
        <button className="rounded-md bg-white border border-[#cfccc1] text-[#141413] px-4 py-2 text-sm font-medium hover:bg-[#faf9f5] transition-colors">
          Refresh
        </button>
        <div className="ml-auto">
          {exportTarget ? (
            <ExportButton
              domain={exportTarget.domain}
              subject={exportTarget.subject}
              label={exportTarget.label}
            />
          ) : (
            <ExportButton domain="runs" label="Export" />
          )}
        </div>
      </div>

      <section className="mb-6">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          STATISTICS
        </div>
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            Stats will appear here after the first run. Wiring to the runs
            table is the next step.
          </p>
        </div>
      </section>

      <section className="mb-6">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          RECENT RUNS
        </div>
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            No runs yet — they&apos;ll appear here once the agent runs.
          </p>
        </div>
      </section>

      <section>
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          RUNTIME
        </div>
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 font-mono text-[12px] text-[#6b6a64]">
          {agent.runtime === "fn"
            ? "Vercel serverless function — fast, stateless"
            : "Browser worker (Railway/Fly) — long-running Chromium + AI Studio"}
        </div>
      </section>
    </div>
  );
}
