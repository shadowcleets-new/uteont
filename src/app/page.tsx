import { AGENTS } from "@/lib/agents/registry";
import { AgentCard } from "@/components/agent-card";

export default function DashboardPage() {
  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">
        UTEONT
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Status of all 10 agents in the pipeline plus shared infrastructure.
        Click any card to jump into that agent.
      </p>

      <section>
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          AGENTS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AGENTS.map((agent) => (
            <AgentCard key={agent.key} agent={agent} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          SYSTEM STATUS
        </div>
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
          <ul className="text-[12px] text-[#6b6a64] space-y-2 font-serif">
            <li>
              <strong className="font-sans text-[#141413]">Database:</strong>{" "}
              connection check on first query
            </li>
            <li>
              <strong className="font-sans text-[#141413]">Worker:</strong>{" "}
              not yet deployed (see worker/README.md)
            </li>
            <li>
              <strong className="font-sans text-[#141413]">Telegram:</strong>{" "}
              not yet configured
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
