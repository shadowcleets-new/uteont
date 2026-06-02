import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { articles, type Article } from "@/lib/db/schema";
import { fmtAgo } from "@/lib/services/stats";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function fetchArticle(id: number): Promise<Article | null> {
  try {
    const db = getDb();
    const [row] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

const statusColor = (s: string) =>
  s === "published" ? "#6a9bcc" : s === "approved" || s === "qa-passed" ? "#788c5d" : s === "rejected" ? "#a33b2b" : "#6b6a64";

function Score({ label, score }: { label: string; score: number | null }) {
  const color = score == null ? "#9a988e" : score >= 70 ? "#788c5d" : score >= 50 ? "#b8862f" : "#a33b2b";
  return (
    <div className="rounded-[8px] border border-[#f0eee6] bg-[#faf9f5] px-3 py-2">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">{label}</div>
      <div className="text-[18px] font-semibold tabular-nums" style={{ color }}>{score ?? "—"}</div>
    </div>
  );
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const article = await fetchArticle(Number(id));
  if (!article) notFound();

  return (
    <div className="px-9 py-8 max-w-[900px]">
      <Link href="/articles" className="text-[12px] text-[#6b6a64] hover:text-[#d97757]">← Articles</Link>

      <div className="flex items-start justify-between gap-4 mt-3 mb-1">
        <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight">{article.title}</h1>
        <span className="text-[12px] font-medium shrink-0 mt-1.5" style={{ color: statusColor(article.status) }}>
          {article.status}
        </span>
      </div>
      <p className="text-[12px] text-[#9a988e] mb-5">
        /{article.slug} · #{article.id} · {fmtAgo(article.createdAt ? new Date(article.createdAt as unknown as string) : null)}
        {article.cmsUrl && (
          <> · <a href={article.cmsUrl} className="underline hover:text-[#d97757]" target="_blank" rel="noopener noreferrer">live</a></>
        )}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Score label="QA SCORE" score={article.qaScore} />
        <Score label="SEO SCORE" score={article.seoScore} />
        <div className="rounded-[8px] border border-[#f0eee6] bg-[#faf9f5] px-3 py-2 col-span-2">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">META TITLE</div>
          <div className="text-[12px] text-[#141413] truncate">{article.metaTitle ?? "—"}</div>
        </div>
      </div>

      {article.metaDescription && (
        <div className="mb-6">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1">META DESCRIPTION</div>
          <p className="text-[13px] text-[#141413] italic font-serif">{article.metaDescription}</p>
        </div>
      )}

      {(article.qaReport != null || article.seoReport != null) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {article.qaReport != null && (
            <details className="flex-1 min-w-[260px]">
              <summary className="text-[11px] text-[#6b6a64] cursor-pointer font-medium">QA report (JSON)</summary>
              <pre className="mt-2 rounded-[8px] bg-[#faf9f5] border border-[#f0eee6] p-3 text-[11px] overflow-auto max-h-[260px]">
                {JSON.stringify(article.qaReport, null, 2)}
              </pre>
            </details>
          )}
          {article.seoReport != null && (
            <details className="flex-1 min-w-[260px]">
              <summary className="text-[11px] text-[#6b6a64] cursor-pointer font-medium">SEO report (JSON)</summary>
              <pre className="mt-2 rounded-[8px] bg-[#faf9f5] border border-[#f0eee6] p-3 text-[11px] overflow-auto max-h-[260px]">
                {JSON.stringify(article.seoReport, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-2">DRAFT BODY</div>
      <article className="rounded-[10px] border border-[#e8e6dc] bg-white p-6 text-[14px] leading-relaxed text-[#141413] font-serif whitespace-pre-wrap">
        {article.body}
      </article>
    </div>
  );
}
