import { count, eq, like, inArray, not, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runs, articles, ideas, cycles, type Run } from "@/lib/db/schema";

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

export interface DashboardStats {
  activeProjects: number;
  publishedArticles: number;
  totalArticles: number;
  efficiencyRatio: number; // published / total, 0 when none generated
  pendingApprovals: number; // ideas in 'proposed' + articles in 'qa-passed'
  activeRuns: number;       // runs currently 'running'
  // Real quota plumbing lands in Milestone 9; placeholder for tier-1 UI.
  apiQuotaUsedPct: number;
}

function emptyDashboard(): DashboardStats {
  return {
    activeProjects: 0,
    publishedArticles: 0,
    totalArticles: 0,
    efficiencyRatio: 0,
    pendingApprovals: 0,
    activeRuns: 0,
    apiQuotaUsedPct: 0,
  };
}

/**
 * One round-trip per metric — kept flat so a slow link can fail fast and
 * we still render the dashboard with zeros instead of a blank page.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const db = getDb();
    const [
      cyclesActive,
      articlesPublished,
      articlesTotal,
      ideasProposed,
      articlesPendingApproval,
      runsActive,
    ] = await Promise.all([
      db.select({ n: count() }).from(cycles)
        .where(not(inArray(cycles.status, ["published", "archived"]))),
      db.select({ n: count() }).from(articles)
        .where(eq(articles.status, "published")),
      db.select({ n: count() }).from(articles),
      db.select({ n: count() }).from(ideas)
        .where(eq(ideas.status, "proposed")),
      db.select({ n: count() }).from(articles)
        .where(eq(articles.status, "qa-passed")),
      db.select({ n: count() }).from(runs)
        .where(eq(runs.status, "running")),
    ]);

    const published = Number(articlesPublished[0]?.n ?? 0);
    const total = Number(articlesTotal[0]?.n ?? 0);

    return {
      activeProjects: Number(cyclesActive[0]?.n ?? 0),
      publishedArticles: published,
      totalArticles: total,
      efficiencyRatio: total > 0 ? published / total : 0,
      pendingApprovals:
        Number(ideasProposed[0]?.n ?? 0) +
        Number(articlesPendingApproval[0]?.n ?? 0),
      activeRuns: Number(runsActive[0]?.n ?? 0),
      apiQuotaUsedPct: 0,
    };
  } catch (e) {
    console.warn("[stats.getDashboardStats] DB error:", e);
    return emptyDashboard();
  }
}

/**
 * Per-day run counts for sparklines on the dashboard KPI cards. Returns
 * the last `days` buckets (oldest first) so the consumer can render a
 * polyline directly. Zero days when the DB is unreachable.
 */
export async function getRunsByDay(
  days = 14,
): Promise<Array<{ day: string; total: number }>> {
  try {
    const db = getDb();
    const rows = await db.execute<{ day: string; total: number }>(sql`
      SELECT
        to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
        count(*)::int AS total
      FROM ${runs}
      WHERE started_at > now() - (${days}::int * interval '1 day')
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    // neon-http returns { rows } shape via .execute() but drizzle's typing
    // varies; normalize:
    const list = (Array.isArray(rows) ? rows : (rows as unknown as { rows: Array<{ day: string; total: number }> }).rows) ?? [];
    return list.map((r) => ({ day: r.day, total: Number(r.total) }));
  } catch (e) {
    console.warn("[stats.getRunsByDay] DB error:", e);
    return [];
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
