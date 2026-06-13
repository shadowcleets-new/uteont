import Link from "next/link";
import { notFound } from "next/navigation";
import { getCycleDetail } from "@/lib/services/cycles";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function Stage({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">{label.toUpperCase()}</span>
        <span className="text-[10px] text-[#9a988e]">· {count}</span>
      </div>
      {count === 0 ? (
        <p className="text-[12px] text-[#9a988e] italic font-serif">none yet</p>
      ) : (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">{children}</div>
      )}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-[#f3f1ea] first:border-t-0 text-[12px] text-[#141413]">
      {children}
    </div>
  );
}

export default async function CycleDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getCycleDetail(Number(id)).catch(() => null);
  if (!detail) notFound();
  const { cycle, keywords, ideas, articles, jobs, runs } = detail;

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <Link href="/cycles" className="text-[12px] text-[#9a988e] hover:text-[#d97757]">← Cycles</Link>
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mt-2 mb-1">{cycle.goal}</h1>
      <p className="text-[12px] text-[#9a988e] mb-8">
        Cycle #{cycle.id} · <span className="font-medium">{cycle.status}</span>
        {Array.isArray(cycle.seedTerms) && cycle.seedTerms.length > 0 && (
          <> · seeds: {cycle.seedTerms.join(", ")}</>
        )}
      </p>

      <Stage label="Keywords" count={keywords.length}>
        {keywords.map((k) => (
          <Row key={k.id}>
            <span className="font-medium truncate">{k.keyword}</span>
            <span className="text-[11px] text-[#9a988e]">rank {k.priorityRank}</span>
            <span className="text-[11px] ml-auto text-[#9a988e]">{k.status}</span>
          </Row>
        ))}
      </Stage>

      <Stage label="Ideas" count={ideas.length}>
        {ideas.map((i) => (
          <Row key={i.id}>
            <span className="font-medium truncate">{i.angle}</span>
            <span className="text-[11px] ml-auto text-[#9a988e]">{i.status}</span>
          </Row>
        ))}
      </Stage>

      <Stage label="Articles" count={articles.length}>
        {articles.map((a) => (
          <Row key={a.id}>
            <Link href={`/articles/${a.id}`} className="font-medium truncate hover:text-[#d97757]">{a.title}</Link>
            <span className="text-[11px] ml-auto text-[#9a988e]">{a.status}</span>
          </Row>
        ))}
      </Stage>

      <Stage label="Jobs" count={jobs.length}>
        {jobs.map((j) => (
          <Row key={j.id}>
            <span className="font-medium">{j.agentKey}</span>
            <span className="text-[11px] ml-auto text-[#9a988e]">{j.status}</span>
          </Row>
        ))}
      </Stage>

      <Stage label="Runs" count={runs.length}>
        {runs.map((r) => (
          <Row key={r.id}>
            <span className="font-medium truncate">{r.subjectKey}</span>
            <span className="text-[11px] ml-auto text-[#9a988e]">{r.status}</span>
          </Row>
        ))}
      </Stage>
    </div>
  );
}
