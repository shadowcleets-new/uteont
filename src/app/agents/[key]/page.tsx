import { notFound } from "next/navigation";
import { findAgent } from "@/lib/agents/registry";
import { exportTargetFor } from "@/lib/agents/export-mapping";
import { StatusPill } from "@/components/status-pill";
import { ExportButton } from "@/components/export-button";
import { getAgentStats, fmtDuration, fmtAgo } from "@/lib/services/stats";
import { listRuns } from "@/lib/services/runs";
import type { Run } from "@/lib/db/schema";
import type { PillState } from "@/lib/theme";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ key: string }>;
}

export default async function AgentPage({ params }: PageProps) {
  const { key } = await params;
  const agent = findAgent(key);
  if (!agent) notFound();

  const [stats, recentRuns] = await Promise.all([
    getAgentStats(key),
    listRuns(`agent.${key}`, 20).catch(() => [] as Run[]),
  ]);

  const exportTarget = exportTargetFor(agent);

  let pill: PillState = "Idle";
  if (!agent.implemented) pill = "Planned";
  else if (stats.running > 0) pill = "Running";
  else if (stats.lastStatus === "failure") pill = "Failed";
  else if (stats.lastStatus === "success") pill = "Success";

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
        <RunAgentButton agentKey={agent.key} disabled={!agent.implemented} />
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

      {/* STATS */}
      <section className="mb-6">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          STATISTICS
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCell label="Total runs" value={String(stats.totalRuns)} />
          <StatCell
            label="Success rate"
            value={
              stats.totalRuns > 0
                ? `${Math.round(stats.successRate * 100)}%`
                : "—"
            }
          />
          <StatCell
            label="Total time"
            value={fmtDuration(stats.totalSeconds)}
          />
          <StatCell
            label="Last run"
            value={fmtAgo(stats.lastRunAt)}
            subtle={stats.lastStatus ?? undefined}
          />
        </div>
      </section>

      {/* RECENT RUNS */}
      <section className="mb-6">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
          RECENT RUNS
        </div>
        {recentRuns.length === 0 ? (
          <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
            <p className="text-[12px] text-[#9a988e] italic font-serif">
              No runs yet — they&apos;ll appear here once the agent runs.
            </p>
          </div>
        ) : (
          <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-[#faf9f5]">
                <tr className="text-[10px] font-bold tracking-wider text-[#9a988e] text-left">
                  <th className="px-4 py-2.5">STARTED</th>
                  <th className="px-4 py-2.5">STATUS</th>
                  <th className="px-4 py-2.5">DURATION</th>
                  <th className="px-4 py-2.5">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RUNTIME */}
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

interface StatCellProps {
  label: string;
  value: string;
  subtle?: string;
}

function StatCell({ label, value, subtle }: StatCellProps) {
  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-4 py-3">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
        {label.toUpperCase()}
      </div>
      <div className="text-[18px] font-semibold mt-1 text-[#141413]">
        {value}
      </div>
      {subtle && (
        <div className="text-[11px] text-[#9a988e] italic mt-0.5">{subtle}</div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  const started = run.startedAt ? new Date(run.startedAt as unknown as string) : null;
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
  return (
    <tr className="border-t border-[#f3f1ea]">
      <td className="px-4 py-2 text-[#141413]">{fmtAgo(started)}</td>
      <td className="px-4 py-2">
        <span style={{ color: statusColor }} className="font-medium">
          {run.status}
        </span>
      </td>
      <td className="px-4 py-2 text-[#6b6a64]">{duration}</td>
      <td className="px-4 py-2 text-[#6b6a64]">{run.action}</td>
    </tr>
  );
}

// --- client island for the Run button ---
function RunAgentButton({
  agentKey,
  disabled,
}: {
  agentKey: string;
  disabled: boolean;
}) {
  // Server-rendered link; a future client island can replace this with a
  // POST + spinner. Keeping it simple: an <a> that hits the run endpoint via
  // a tiny inline form so we don't need to mark the whole page as client.
  if (disabled) {
    return (
      <button
        disabled
        className="rounded-md bg-[#f3f1ea] text-[#9a988e] px-4 py-2 text-sm font-medium cursor-not-allowed"
      >
        Run agent
      </button>
    );
  }
  return (
    <form action="/api/agents/run-redirect" method="post">
      <input type="hidden" name="agentKey" value={agentKey} />
      <button
        type="submit"
        className="rounded-md bg-[#d97757] text-white px-4 py-2 text-sm font-medium hover:bg-[#c66948] transition-colors"
      >
        Run agent
      </button>
    </form>
  );
}
