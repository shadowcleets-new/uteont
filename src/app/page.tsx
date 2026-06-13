import { AGENTS } from "@/lib/agents/registry";
import { AgentCard } from "@/components/agent-card";
import { LiveStatus } from "@/components/live-status";
import { getAllAgentStats, fmtDuration, fmtAgo } from "@/lib/services/stats";
import { listRuns } from "@/lib/services/runs";
import { listTargetsWithProgress } from "@/lib/services/targets";
import { captureSnapshots, snapshotsByTarget } from "@/lib/services/target-snapshots";
import { pickNextAction } from "@/lib/services/next-action";
import { TargetMini } from "@/components/target-mini";
import { NextActionCard } from "@/components/next-action-card";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getDb } from "@/lib/db/client";
import { kvSettings, sites } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { Run } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function getActiveSiteIdServer(): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(kvSettings)
    .where(eq(kvSettings.key, "ui.activeSiteId"))
    .limit(1);
  return row ? (row.value as { id: number | null }).id : null;
}

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
  const [stats, sysStatus, activeSiteId] = await Promise.all([
    getAllAgentStats(),
    getSystemStatus(),
    getActiveSiteIdServer(),
  ]);

  // Recent runs, filtered by active site when one is selected
  const recent = activeSiteId
    ? await listRuns(undefined, 20, { siteId: activeSiteId })
    : await listRuns(undefined, 20);

  // Objectives for the selected site: derive both the display list and the
  // single recommended action from the full set (so the nudge isn't capped).
  const allTargets = activeSiteId
    ? await listTargetsWithProgress(activeSiteId).catch(() => [])
    : [];
  const activeTargets = allTargets.filter((t) => t.status === "active").slice(0, 5);
  const nextAction = pickNextAction(allTargets);

  // Accrue trajectory history from dashboard loads too (debounced, never throws).
  if (allTargets.length > 0) {
    await captureSnapshots(allTargets.map((t) => ({ id: t.id, value: t.current })));
  }
  const targetHistory =
    activeTargets.length > 0
      ? await snapshotsByTarget(activeTargets.map((t) => t.id)).catch(() => new Map())
      : new Map();

  // Active-site connection health (so connecting GSC/GA4/etc is discoverable here).
  let connections: { key: string; gsc: boolean; ga4: boolean; slack: boolean; cms: boolean } | null = null;
  if (activeSiteId) {
    try {
      const { listIntegrations } = await import("@/lib/services/integrations");
      const [siteRow] = await getDb()
        .select({ key: sites.key, ga4: sites.ga4PropertyId })
        .from(sites)
        .where(eq(sites.id, activeSiteId))
        .limit(1);
      const kinds = new Set((await listIntegrations(activeSiteId)).map((i) => i.kind));
      if (siteRow) {
        connections = {
          key: siteRow.key,
          gsc: kinds.has("gsc"),
          ga4: Boolean(siteRow.ga4),
          slack: kinds.has("slack"),
          cms: ["wordpress", "shopify", "webflow", "ghost", "vercel"].some((k) => kinds.has(k)),
        };
      }
    } catch (e) {
      console.warn("connections load failed", e);
    }
  }

  // Look up site names without N+1 queries
  const db = getDb();
  const siteIds = [...new Set(recent.map((r) => r.siteId))];
  const siteRows =
    siteIds.length === 0
      ? []
      : await db.select().from(sites).where(inArray(sites.id, siteIds));
  const siteById = new Map(siteRows.map((s) => [s.id, s]));

  const totalRuns = Object.values(stats).reduce((acc, s) => acc + s.totalRuns, 0);
  const runningCount = Object.values(stats).reduce((acc, s) => acc + (s.running ?? 0), 0);
  const implementedAgents = AGENTS.filter((a) => a.implemented).length;

  // LO-21: quiet-by-default attention summary — what needs you vs what's just done.
  let attention = { needsYou: 0, critical: 0, done: 0 };
  try {
    const { listCheckpoints } = await import("@/lib/services/checkpoints");
    const { summarizeAttention } = await import("@/lib/services/attention");
    const pending = await listCheckpoints({ status: "pending", siteId: activeSiteId ?? undefined });
    attention = summarizeAttention({
      checkpoints: pending.map((c) => ({ status: c.status, blastRadius: c.blastRadius })),
      runs: recent.map((r) => ({ status: r.status })),
    });
  } catch {
    /* attention is best-effort */
  }

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">
        UTEONT
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Status of all {AGENTS.length} agents in the pipeline plus shared infrastructure.
        Click any card to jump into that agent.
      </p>

      {runningCount > 0 && (
        <div className="mb-6">
          <LiveStatus runningCount={runningCount} />
        </div>
      )}

      {/* LO-21: quiet-by-default attention line. Loud only when something needs you. */}
      <div className="mb-6 flex items-center gap-3 text-[13px]">
        {attention.needsYou > 0 ? (
          <Link
            href="/approvals"
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium transition-colors",
              attention.critical > 0
                ? "bg-[#f6e0db] text-[#a33b2b] hover:bg-[#f0d2cb]"
                : "bg-[#f6ecd6] text-[#8a6516] hover:bg-[#efe2c2]",
            )}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
            {attention.needsYou} need{attention.needsYou === 1 ? "s" : ""} you
            {attention.critical > 0 && ` · ${attention.critical} high-impact`}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-[#eef2e9] text-[#4a6b2f]">
            ✓ All clear — nothing needs you
          </span>
        )}
        <span className="text-[#9a988e]">{attention.done} done recently</span>
      </div>

      {nextAction && (
        <div className="mb-8">
          <NextActionCard action={nextAction} />
        </div>
      )}

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

      {connections && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">CONNECTIONS</div>
            <Link href={`/sites/${connections.key}/integrations`} className="text-[11px] text-[#d97757] hover:underline">
              Manage →
            </Link>
          </div>
          <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 flex flex-wrap gap-2">
            <ConnChip label="Search Console" on={connections.gsc} href={`/sites/${connections.key}/integrations`} />
            <ConnChip label="GA4" on={connections.ga4} href={`/sites/${connections.key}/edit`} />
            <ConnChip label="Slack" on={connections.slack} href={`/sites/${connections.key}/integrations`} />
            <ConnChip label="CMS publish" on={connections.cms} href={`/sites/${connections.key}/integrations`} />
          </div>
        </section>
      )}

      {activeTargets.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">OBJECTIVES</div>
            <Link href="/targets" className="text-[11px] text-[#d97757] hover:underline">
              All targets →
            </Link>
          </div>
          <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
            {activeTargets.map((t) => (
              <TargetMini key={t.id} t={t} history={targetHistory.get(t.id) ?? []} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          AGENTS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AGENTS.map((agent) => (
            <AgentCard key={agent.key} agent={agent} stats={stats[agent.key]} />
          ))}
        </div>
      </section>

      <section>
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          RECENT RUNS
        </div>
        {recent.length === 0 ? (
          <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
            <p className="text-[12px] text-[#9a988e] italic font-serif">
              No runs yet — they&apos;ll appear here once agents run.
            </p>
          </div>
        ) : (
          <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-[#faf9f5]">
                <tr className="text-[10px] font-bold tracking-wider text-[#9a988e] text-left">
                  <th className="px-4 py-2.5">AGENT</th>
                  <th className="px-4 py-2.5">STARTED</th>
                  <th className="px-4 py-2.5">STATUS</th>
                  <th className="px-4 py-2.5">DURATION</th>
                  {activeSiteId === null && (
                    <th className="px-4 py-2.5">SITE</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <DashRunRow
                    key={r.id}
                    run={r}
                    showSite={activeSiteId === null}
                    siteName={siteById.get(r.siteId)?.name ?? String(r.siteId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
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

function ConnChip({ label, on, href }: { label: string; on: boolean; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full border transition-colors hover:opacity-80"
      style={
        on
          ? { background: "#e7efe0", color: "#4a6b2f", borderColor: "#d3e3c8" }
          : { background: "#faf9f5", color: "#9a988e", borderColor: "#e8e6dc" }
      }
    >
      <span className="font-bold">{on ? "✓" : "○"}</span> {label}
    </Link>
  );
}

interface DashRunRowProps {
  run: Run;
  showSite: boolean;
  siteName: string;
}

function DashRunRow({ run, showSite, siteName }: DashRunRowProps) {
  const started = run.startedAt
    ? new Date(run.startedAt as unknown as string)
    : null;
  const finished = run.finishedAt
    ? new Date(run.finishedAt as unknown as string)
    : null;
  const duration =
    started && finished
      ? fmtDuration((finished.getTime() - started.getTime()) / 1000)
      : run.status === "running"
        ? "running…"
        : "—";
  const statusColor =
    run.status === "success"
      ? "#788c5d"
      : run.status === "failure"
        ? "#a33b2b"
        : "#9a988e";
  // Extract the agent key from subjectKey (format: "agent.<key>")
  const agentLabel = run.subjectKey.startsWith("agent.")
    ? run.subjectKey.slice(6)
    : run.subjectKey;
  return (
    <tr className="border-t border-[#f3f1ea]">
      <td className="px-4 py-2 text-[#141413] font-medium">{agentLabel}</td>
      <td className="px-4 py-2 text-[#141413]">{fmtAgo(started)}</td>
      <td className="px-4 py-2">
        <span style={{ color: statusColor }} className="font-medium">
          {run.status}
        </span>
      </td>
      <td className="px-4 py-2 text-[#6b6a64]">{duration}</td>
      {showSite && (
        <td className="px-4 py-2 text-[#6b6a64]">{siteName}</td>
      )}
    </tr>
  );
}
