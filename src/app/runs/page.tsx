import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { runs, type Run } from "@/lib/db/schema";
import { RunCard } from "@/components/runs/RunCard";

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

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status as keyof typeof acc] =
        (acc[r.status as keyof typeof acc] ?? 0) + 1;
      return acc;
    },
    { success: 0, failure: 0, running: 0 } as Record<string, number>,
  );

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-1">
        Runs
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-4">
        Full execution history. Click any row to expand its timeline,
        token spend, and error context.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px]">
        <Badge label={`${rows.length} runs`} />
        <Badge label={`${counts.success ?? 0} success`} tone="ok" />
        <Badge label={`${counts.failure ?? 0} failed`} tone="err" />
        <Badge label={`${counts.running ?? 0} running`} tone="warn" />
        {subject && (
          <>
            <span className="text-[11px] text-[#9a988e] ml-2">filter:</span>
            <span className="text-[11px] font-mono text-[#141413]">
              {subject}
            </span>
            <Link
              href="/runs"
              className="text-[10px] text-[#9a988e] hover:text-[#a33b2b] underline"
            >
              clear
            </Link>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            No runs {subject ? `for subject "${subject}"` : "yet"}.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold tracking-wider text-[#9a988e]">
            <div className="col-span-1">ID</div>
            <div className="col-span-4">SUBJECT</div>
            <div className="col-span-3">ACTION</div>
            <div className="col-span-2">STATUS</div>
            <div className="col-span-2 text-right">DURATION</div>
          </div>
          {rows.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "ok" | "err" | "warn" | "neutral";
}) {
  const c =
    tone === "ok"
      ? "border-[#788c5d] text-[#788c5d] bg-[#f0f4ea]"
      : tone === "err"
        ? "border-[#a33b2b] text-[#a33b2b] bg-[#fbeceb]"
        : tone === "warn"
          ? "border-[#d97757] text-[#a33b2b] bg-[#fef3eb]"
          : "border-[#e8e6dc] text-[#6b6a64] bg-white";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-medium ${c}`}
    >
      {label}
    </span>
  );
}
