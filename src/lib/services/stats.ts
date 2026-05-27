import { eq, like } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runs, type Run } from "@/lib/db/schema";

export interface AgentStats {
  totalRuns: number;
  successful: number;
  failed: number;
  running: number;
  totalSeconds: number;
  avgSeconds: number;
  successRate: number;
  lastRunAt: Date | null;
  lastStatus: string | null;
}

function emptyStats(): AgentStats {
  return {
    totalRuns: 0,
    successful: 0,
    failed: 0,
    running: 0,
    totalSeconds: 0,
    avgSeconds: 0,
    successRate: 0,
    lastRunAt: null,
    lastStatus: null,
  };
}

function aggregate(rs: Run[]): AgentStats {
  let success = 0, failure = 0, running = 0, totalSec = 0;
  let lastAt: Date | null = null;
  let lastStatus: string | null = null;
  for (const r of rs) {
    if (r.status === "success") success++;
    else if (r.status === "failure") failure++;
    else if (r.status === "running") running++;
    if (r.finishedAt && r.startedAt) {
      const dur =
        new Date(r.finishedAt as unknown as string).getTime() -
        new Date(r.startedAt as unknown as string).getTime();
      if (dur > 0) totalSec += dur / 1000;
    }
    const started = r.startedAt ? new Date(r.startedAt as unknown as string) : null;
    if (started && (!lastAt || started > lastAt)) {
      lastAt = started;
      lastStatus = r.status;
    }
  }
  const completed = success + failure;
  return {
    totalRuns: rs.length,
    successful: success,
    failed: failure,
    running,
    totalSeconds: totalSec,
    avgSeconds: completed > 0 ? totalSec / completed : 0,
    successRate: completed > 0 ? success / completed : 0,
    lastRunAt: lastAt,
    lastStatus,
  };
}

export async function getAgentStats(agentKey: string): Promise<AgentStats> {
  try {
    const db = getDb();
    const rs = await db
      .select()
      .from(runs)
      .where(eq(runs.subjectKey, `agent.${agentKey}`));
    return aggregate(rs);
  } catch (e) {
    // F-020: log the error instead of swallowing silently.
    console.warn(`[stats.getAgentStats] DB error for agent=${agentKey}:`, e);
    return emptyStats();
  }
}

export async function getAllAgentStats(): Promise<Record<string, AgentStats>> {
  try {
    const db = getDb();
    const rs = await db.select().from(runs).where(like(runs.subjectKey, "agent.%"));
    const grouped: Record<string, Run[]> = {};
    for (const r of rs) {
      const key = r.subjectKey.replace(/^agent\./, "");
      (grouped[key] ??= []).push(r);
    }
    const out: Record<string, AgentStats> = {};
    for (const [k, list] of Object.entries(grouped)) out[k] = aggregate(list);
    return out;
  } catch (e) {
    console.warn("[stats.getAllAgentStats] DB error:", e);
    return {};
  }
}

export function fmtDuration(s: number): string {
  if (!s || s <= 0) return "—";
  const sec = Math.round(s);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function fmtAgo(d: Date | null): string {
  if (!d) return "—";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
