"use client";

import { useEffect, useState } from "react";

interface ActiveJob {
  id: number;
  agentKey: string;
  status: string; // queued | claimed
  createdAt: string;
  planId: number | null;
  stepN: number | null;
}

/**
 * Live strip of in-flight jobs for the active site. Polls every 5s while
 * mounted; renders nothing when idle. `claimed` = the worker is on it now;
 * `queued` = waiting for the worker.
 */
export function LiveJobs({ intervalMs = 5000 }: { intervalMs?: number }) {
  const [items, setItems] = useState<ActiveJob[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/ui/active-jobs", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: ActiveJob[] };
        if (alive) setItems(data.jobs ?? []);
      } catch {
        /* transient — keep last state */
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-4 py-3 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d97757] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#d97757]" />
        </span>
        <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">
          LIVE — {items.length} JOB{items.length > 1 ? "S" : ""} IN FLIGHT
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((j) => (
          <li key={j.id} className="text-[12px] text-[#141413]">
            <span className="font-medium">{j.agentKey}</span>
            <span className="text-[#6b6a64]">
              {" "}· job #{j.id} · {j.status === "claimed" ? "running on the worker" : "waiting for the worker"}
              {j.planId ? ` · plan #${j.planId}, step ${j.stepN}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
