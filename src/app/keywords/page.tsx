import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywords, type Keyword } from "@/lib/db/schema";
import { fmtAgo } from "@/lib/services/stats";
import { KeywordActions } from "@/components/keyword-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

async function fetchKeywords(status?: string): Promise<Keyword[]> {
  try {
    const db = getDb();
    const where = status ? eq(keywords.status, status) : undefined;
    return await db
      .select()
      .from(keywords)
      .where(where)
      .orderBy(desc(keywords.priorityRank))
      .limit(200);
  } catch {
    return [];
  }
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "researched", label: "Researched" },
  { value: "approved", label: "Approved" },
  { value: "shelved", label: "Shelved" },
  { value: "in-progress", label: "In progress" },
  { value: "published", label: "Published" },
];

export default async function KeywordsPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const rows = await fetchKeywords(status);

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">
        Keywords
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Research Agent output. Approve to send to Idea Generation, or shelve
        with an optional reason.
      </p>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((f) => {
          const active = (status ?? "") === f.value;
          const href = f.value
            ? `/keywords?status=${encodeURIComponent(f.value)}`
            : "/keywords";
          return (
            <Link
              key={f.value || "all"}
              href={href}
              className={
                "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors " +
                (active
                  ? "bg-[#d97757] text-white border-[#d97757]"
                  : "bg-white text-[#141413] border-[#cfccc1] hover:bg-[#faf9f5]")
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            No keywords {status ? `with status "${status}"` : "yet"}.
            Run the Research Agent to populate this table.
          </p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-[#faf9f5]">
              <tr className="text-[10px] font-bold tracking-wider text-[#9a988e] text-left">
                <th className="px-4 py-2.5 w-12">#</th>
                <th className="px-4 py-2.5">KEYWORD</th>
                <th className="px-4 py-2.5">VOLUME</th>
                <th className="px-4 py-2.5">COMP</th>
                <th className="px-4 py-2.5">SOURCE</th>
                <th className="px-4 py-2.5">STATUS</th>
                <th className="px-4 py-2.5">FOUND</th>
                <th className="px-4 py-2.5 w-32">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <KeywordRow key={k.id} k={k} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KeywordRow({ k }: { k: Keyword }) {
  const created = k.createdAt ? new Date(k.createdAt as unknown as string) : null;
  const statusColor =
    k.status === "approved"
      ? "#788c5d"
      : k.status === "shelved"
        ? "#a33b2b"
        : k.status === "published"
          ? "#6a9bcc"
          : "#6b6a64";
  return (
    <tr className="border-t border-[#f3f1ea]">
      <td className="px-4 py-2.5 text-[#9a988e]">{k.priorityRank}</td>
      <td className="px-4 py-2.5 text-[#141413] font-medium">{k.keyword}</td>
      <td className="px-4 py-2.5 text-[#6b6a64] tabular-nums">
        {k.searchVolumeEstimate.toLocaleString()}
      </td>
      <td className="px-4 py-2.5 text-[#6b6a64] tabular-nums">
        {(k.competitionScore * 100).toFixed(0)}%
      </td>
      <td className="px-4 py-2.5 text-[#9a988e] text-[11px]">
        {k.source.slice(0, 30)}
      </td>
      <td className="px-4 py-2.5">
        <span style={{ color: statusColor }} className="font-medium">
          {k.status}
        </span>
        {k.shelvedReason && (
          <div className="text-[10px] text-[#9a988e] italic mt-0.5">
            {k.shelvedReason.slice(0, 60)}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-[#9a988e] text-[11px]">
        {fmtAgo(created)}
      </td>
      <td className="px-4 py-2.5">
        <KeywordActions id={k.id} status={k.status} />
      </td>
    </tr>
  );
}
