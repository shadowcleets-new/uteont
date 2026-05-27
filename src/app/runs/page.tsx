import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runs, type Run } from "@/lib/db/schema";
import { fmtAgo, fmtDuration } from "@/lib/services/stats";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ subject?: string }>;
}

async function fetchRuns(subject?: string): Promise<Run[]> {
  try {
    const db = getDb();
    const where = subject ? eq(runs.subjectKey, subject) : undefined;
    return await db
      .select()
      .from(runs)
      .where(where)
      .orderBy(desc(runs.id))
      .limit(200);
  } catch {
    return [];
  }
}

export default async function RunsPage({ searchParams }: PageProps) {
  const { subject } = await searchParams;
  const rows = await fetchRuns(subject);

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">
        Runs
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Full history of agent executions across the pipeline. Filter by
        clicking the subject of any row.
      </p>

      {subject && (
        <div className="mb-4 text-[12px]">
          <span className="text-[#6b6a64]">Filter:</span>{" "}
          <span className="text-[#141413] font-mono">{subject}</span>{" "}
          <Link
            href="/runs"
            className="text-[#9a988e] hover:text-[#6b6a64] underline ml-2"
          >
            clear
          </Link>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            No runs {subject ? `for subject "${subject}"` : "yet"}.
          </p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-[#faf9f5]">
              <tr className="text-[10px] font-bold tracking-wider text-[#9a988e] text-left">
                <th className="px-4 py-2.5 w-12">ID</th>
                <th className="px-4 py-2.5">SUBJECT</th>
                <th className="px-4 py-2.5">ACTION</th>
                <th className="px-4 py-2.5">STATUS</th>
                <th className="px-4 py-2.5">STARTED</th>
                <th className="px-4 py-2.5">DURATION</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
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
  return (
    <tr className="border-t border-[#f3f1ea]">
      <td className="px-4 py-2.5 text-[#9a988e]">{run.id}</td>
      <td className="px-4 py-2.5">
        <Link
          href={`/runs?subject=${encodeURIComponent(run.subjectKey)}`}
          className="text-[#141413] hover:text-[#d97757] font-mono text-[11px]"
        >
          {run.subjectKey}
        </Link>
      </td>
      <td className="px-4 py-2.5 text-[#6b6a64]">{run.action}</td>
      <td className="px-4 py-2.5">
        <span style={{ color: statusColor }} className="font-medium">
          {run.status}
        </span>
      </td>
      <td className="px-4 py-2.5 text-[#9a988e]">{fmtAgo(started)}</td>
      <td className="px-4 py-2.5 text-[#6b6a64] tabular-nums">{duration}</td>
    </tr>
  );
}
