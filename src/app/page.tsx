import { AGENTS } from "@/lib/agents/registry";
import { AgentCard } from "@/components/agent-card";
import {
  getAllAgentStats,
  getDashboardStats,
  getRunsByDay,
} from "@/lib/services/stats";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ActiveRuns } from "@/components/dashboard/active-runs";
import { PendingApprovalsCard } from "@/components/dashboard/pending-approvals";
import { LiveAgentConsole } from "@/components/dashboard/live-agent-console";

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
  const [agentStats, dashStats, sysStatus, trend] = await Promise.all([
    getAllAgentStats(),
    getDashboardStats(),
    getSystemStatus(),
    getRunsByDay(14),
  ]);

  const trendValues = trend.map((d) => d.total);
  const efficiencyPct = Math.round(dashStats.efficiencyRatio * 100);

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-1">
        UTEONT
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Status of the autonomous SEO pipeline. Use{" "}
        <kbd className="px-1.5 py-0.5 rounded border border-[#e8e6dc] bg-[#f3f1ea] text-[10px] font-mono">
          Ctrl + \
        </kbd>{" "}
        to collapse the sidebar for a wider canvas.
      </p>

      {/* ── Tier 1 — High-level KPIs ─────────────────────────────────────── */}
      <section
        aria-label="Key performance indicators"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
      >
        <KpiCard
          label="ACTIVE PROJECTS"
          value={String(dashStats.activeProjects)}
          tone="neutral"
          trend={trendValues}
          hint="Cycles not yet published or archived"
        />
        <KpiCard
          label="PUBLISHED ARTICLES"
          value={String(dashStats.publishedArticles)}
          tone="ok"
          trend={trendValues}
          hint={
            dashStats.publishedArticles > 0
              ? `+${dashStats.publishedArticles} lifetime`
              : "No drafts published yet"
          }
        />
        <KpiCard
          label="API QUOTA USED"
          value={`${dashStats.apiQuotaUsedPct}%`}
          tone={dashStats.apiQuotaUsedPct > 80 ? "err" : "neutral"}
          progressPct={dashStats.apiQuotaUsedPct}
          hint="Quota tracking lands in Milestone 9"
        />
        <KpiCard
          label="EFFICIENCY"
          value={
            dashStats.totalArticles === 0
              ? "—"
              : `${efficiencyPct}%`
          }
          tone={efficiencyPct >= 60 ? "ok" : efficiencyPct >= 30 ? "warn" : "err"}
          progressPct={efficiencyPct}
          hint={`${dashStats.publishedArticles} of ${dashStats.totalArticles} drafts published`}
        />
      </section>

      {/* ── Tier 2 — Operational velocity ────────────────────────────────── */}
      <section
        aria-label="Operational status"
        className="grid grid-cols-1 lg:grid-cols-5 gap-3 mb-6"
      >
        <div className="lg:col-span-3">
          <ActiveRuns stats={agentStats} />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-3">
          <PendingApprovalsCard count={dashStats.pendingApprovals} />
          <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4">
            <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1">
              SYSTEM
            </div>
            <div
              className="text-[14px] font-semibold"
              style={{
                color: sysStatus.dbReachable ? "#788c5d" : "#a33b2b",
                fontFamily: "Poppins, Arial, sans-serif",
              }}
            >
              Database {sysStatus.dbReachable ? "connected" : "unreachable"}
            </div>
            <div className="text-[11px] text-[#9a988e] font-serif italic mt-1">
              {dashStats.activeRuns} run
              {dashStats.activeRuns === 1 ? "" : "s"} currently in flight
            </div>
          </div>
        </div>
      </section>

      {/* ── Tier 3 — Live agent console ──────────────────────────────────── */}
      <section aria-label="Live agent console" className="mb-8">
        <LiveAgentConsole />
      </section>

      {/* Agent registry retained below — useful at-a-glance map of the 10
          agents and their last-run state. */}
      <section aria-label="Agent registry">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          AGENTS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AGENTS.map((agent) => (
            <AgentCard key={agent.key} agent={agent} stats={agentStats[agent.key]} />
          ))}
        </div>
      </section>
    </div>
  );
}
