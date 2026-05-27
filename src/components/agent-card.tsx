import Link from "next/link";
import type { AgentSpec } from "@/lib/agents/registry";
import { StatusPill } from "./status-pill";
import type { PillState } from "@/lib/theme";
import { type AgentStats, fmtDuration, fmtAgo } from "@/lib/services/stats";

interface AgentCardProps {
  agent: AgentSpec;
  stats?: AgentStats;
}

function pillFor(agent: AgentSpec, stats?: AgentStats): PillState {
  if (!agent.implemented) return "Planned";
  if (stats?.running && stats.running > 0) return "Running";
  if (stats?.lastStatus === "failure") return "Failed";
  if (stats?.lastStatus === "success") return "Success";
  return "Idle";
}

export function AgentCard({ agent, stats }: AgentCardProps) {
  const pill = pillFor(agent, stats);
  const total = stats?.totalRuns ?? 0;
  const totalTime = fmtDuration(stats?.totalSeconds ?? 0);

  return (
    <Link
      href={`/agents/${agent.key}`}
      className="block rounded-[10px] border border-[#e8e6dc] bg-white px-4 py-3 hover:border-[#d97757] hover:bg-[#faf9f5] transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-[13px] font-semibold text-[#141413]">
          {agent.sidebarLabel}
        </div>
        <StatusPill state={pill} />
      </div>
      <div className="text-[11px] text-[#6b6a64]">
        {total} run{total === 1 ? "" : "s"} · {totalTime} total
        {stats && stats.successRate > 0 && total > 0 && (
          <> · {Math.round(stats.successRate * 100)}% ok</>
        )}
      </div>
      <div className="text-[11px] text-[#9a988e] italic mt-1 font-serif">
        {stats?.lastRunAt
          ? `Last run: ${fmtAgo(stats.lastRunAt)}${stats.lastStatus ? ` (${stats.lastStatus})` : ""}`
          : "Never run"}
      </div>
    </Link>
  );
}
