import { AGENTS } from "@/lib/agents/registry";
import { AgentCard } from "@/components/agent-card";
import { getAllAgentStats } from "@/lib/services/stats";

export const dynamic = "force-dynamic";

async function getSystemStatus() {
  try {
    const { sql } = await import("drizzle-orm");
    const { getDb } = await import("@/lib/db/client");
    await getDb().execute(sql`SELECT 1`);
    return { dbReachable: true };
  } catch {
    return { dbReachable: false };
  }
}

export default async function DashboardPage() {
  const [stats, sysStatus] = await Promise.all([
    getAllAgentStats(),
    getSystemStatus(),
  ]);

  const totalRuns = Object.values(stats).reduce((acc, s) => acc + s.totalRuns, 0);
  const implementedAgents = AGENTS.filter((a) => a.implemented).length;

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">
        UTEONT
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Status of all 10 agents in the pipeline plus shared infrastructure.
        Click any card to jump into that agent.
      </p>

      {/* At-a-glance numbers */}
      <section className="grid grid-cols-3 gap-3 mb-8">
        <Stat label="AGENTS LIVE" value={`${implementedAgents}/${AGENTS.length}`} />
        <Stat label="TOTAL RUNS" value={String(totalRuns)} />
        <Stat
          label="DATABASE"
          value={sysStatus.dbReachable ? "Connected" : "Unreachable"}
          tone={sysStatus.dbReachable ? "ok" : "err"}
        />
      </section>

      <section>
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          AGENTS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AGENTS.map((agent) => (
            <AgentCard key={agent.key} agent={agent} stats={stats[agent.key]} />
          ))}
        </div>
      </section>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone?: "ok" | "err" | "neutral";
}

function Stat({ label, value, tone = "neutral" }: StatProps) {
  const color =
    tone === "ok" ? "#788c5d" : tone === "err" ? "#a33b2b" : "#141413";
  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
        {label}
      </div>
      <div
        className="text-[22px] font-semibold mt-1"
        style={{ color, fontFamily: "Poppins, Arial, sans-serif" }}
      >
        {value}
      </div>
    </div>
  );
}
