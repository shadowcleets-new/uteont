import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { articles, type Article } from "@/lib/db/schema";
import { fmtAgo } from "@/lib/services/stats";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

async function fetchArticles(status?: string): Promise<Article[]> {
  try {
    const db = getDb();
    const where = status ? eq(articles.status, status) : undefined;
    return await db.select().from(articles).where(where).orderBy(desc(articles.id)).limit(300);
  } catch {
    return [];
  }
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "qa-passed", label: "QA passed" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
];

const statusColor = (s: string) =>
  s === "published" ? "#6a9bcc" : s === "approved" || s === "qa-passed" ? "#788c5d" : s === "rejected" ? "#a33b2b" : "#6b6a64";

function ScoreChip({ label, score }: { label: string; score: number | null }) {
  if (score == null) return <span className="text-[#cfccc1]">{label} —</span>;
  const color = score >= 70 ? "#788c5d" : score >= 50 ? "#b8862f" : "#a33b2b";
  return (
    <span style={{ color }}>
      {label} <span className="tabular-nums font-medium">{score}</span>
    </span>
  );
}

export default async function ArticlesPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const rows = await fetchArticles(status);

  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">Articles</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Content Writing output with QA + SEO scores. Click a row to read the draft and its reports.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((f) => {
          const active = (status ?? "") === f.value;
          const href = f.value ? `/articles?status=${encodeURIComponent(f.value)}` : "/articles";
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
            No articles {status ? `with status "${status}"` : "yet"}. Run the Content Writing agent to populate this.
          </p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-[#faf9f5]">
              <tr className="text-[10px] font-bold tracking-wider text-[#9a988e] text-left">
                <th className="px-4 py-2.5">TITLE</th>
                <th className="px-4 py-2.5">STATUS</th>
                <th className="px-4 py-2.5">QA</th>
                <th className="px-4 py-2.5">SEO</th>
                <th className="px-4 py-2.5">CREATED</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-[#f3f1ea] hover:bg-[#faf9f5]">
                  <td className="px-4 py-2.5">
                    <Link href={`/articles/${a.id}`} className="text-[#141413] font-medium hover:text-[#d97757]">
                      {a.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 font-medium" style={{ color: statusColor(a.status) }}>{a.status}</td>
                  <td className="px-4 py-2.5"><ScoreChip label="" score={a.qaScore} /></td>
                  <td className="px-4 py-2.5"><ScoreChip label="" score={a.seoScore} /></td>
                  <td className="px-4 py-2.5 text-[#9a988e] text-[11px]">
                    {fmtAgo(a.createdAt ? new Date(a.createdAt as unknown as string) : null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
