import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ideas, type Idea } from "@/lib/db/schema";
import { fmtAgo } from "@/lib/services/stats";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

async function fetchIdeas(status?: string): Promise<Idea[]> {
  try {
    const db = getDb();
    const where = status ? eq(ideas.status, status) : undefined;
    return await db.select().from(ideas).where(where).orderBy(desc(ideas.id)).limit(300);
  } catch {
    return [];
  }
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "proposed", label: "Proposed" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "drafting", label: "Drafting" },
  { value: "done", label: "Done" },
];

const statusColor = (s: string) =>
  s === "approved" || s === "done" ? "#788c5d" : s === "rejected" ? "#a33b2b" : s === "drafting" ? "#6a9bcc" : "#6b6a64";

export default async function IdeasPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const rows = await fetchIdeas(status);

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">Ideas</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Idea Generation output — article angles + briefs. Approve in Telegram or the Approvals inbox to send to drafting.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((f) => {
          const active = (status ?? "") === f.value;
          const href = f.value ? `/ideas?status=${encodeURIComponent(f.value)}` : "/ideas";
          return (
            <Link
              key={f.value || "all"}
              href={href}
              className={
                "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors " +
                (active ? "bg-[#d97757] text-white border-[#d97757]" : "bg-white text-[#141413] border-[#cfccc1] hover:bg-[#faf9f5]")
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
            No ideas {status ? `with status "${status}"` : "yet"}. Run the Idea Generation agent to populate this.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((i) => (
            <div key={i.id} className="rounded-[10px] border border-[#e8e6dc] bg-white p-4">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="text-[14px] font-medium text-[#141413]">{i.angle}</h2>
                <span className="text-[11px] font-medium shrink-0" style={{ color: statusColor(i.status) }}>
                  {i.status}
                </span>
              </div>
              <p className="text-[12px] text-[#6b6a64] font-serif">{i.brief}</p>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-[#9a988e]">
                {i.intent && <span className="rounded bg-[#faf9f5] border border-[#f0eee6] px-1.5 py-0.5">{i.intent}</span>}
                <span>#{i.id}</span>
                <span>{fmtAgo(i.createdAt ? new Date(i.createdAt as unknown as string) : null)}</span>
                {i.rejectReason && <span className="italic text-[#a33b2b]">{i.rejectReason.slice(0, 80)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
