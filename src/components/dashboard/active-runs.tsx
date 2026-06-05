import { AGENTS } from "@/lib/agents/registry";
import type { AgentStats } from "@/lib/services/stats";

interface ActiveRunsProps {
  stats: Record<string, AgentStats>;
}

/**
 * Tier-2 Left — agents currently running, with a thin progress bar per
 * agent showing how much of its theoretical pipeline depth is active.
 * The pipeline-depth approximation is a placeholder until the Milestone-6
 * state machine lands; for now we show 1/1 when running, 0/1 idle.
 */
export function ActiveRuns({ stats }: ActiveRunsProps) {
  const active = AGENTS.filter((a) => {
    const s = stats[a.key];
    return s && s.running > 0;
  });

  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white">
      <div className="px-5 py-3 border-b border-[#e8e6dc] flex items-center justify-between">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
          ACTIVE AGENT RUNS
        </div>
        <div className="text-[11px] text-[#6b6a64] tabular-nums">
          {active.length} running
        </div>
      </div>
      {active.length === 0 ? (
        <div className="px-5 py-6 text-[12px] text-[#9a988e] italic font-serif">
          No agents running. The pipeline is idle.
        </div>
      ) : (
        <ul className="divide-y divide-[#f3f1ea]">
          {active.map((agent) => {
            const s = stats[agent.key];
            const pct = Math.min(95, 30 + ((s?.running ?? 0) * 25));
            return (
              <li key={agent.key} className="px-5 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[13px] font-medium text-[#141413]">
                    {agent.sidebarLabel}
                  </div>
                  <div className="text-[11px] text-[#6b6a64] tabular-nums">
                    {s?.running} in progress
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-[#f3f1ea] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#d97757] animate-pulse"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
