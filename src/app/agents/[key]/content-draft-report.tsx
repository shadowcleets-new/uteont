import type { DraftResult } from "@/lib/agent-runners/content-draft";

export function ContentDraftReport({ result }: { result: DraftResult }) {
  if (!result.configured || !result.draft) {
    return (
      <section className="mb-6">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">DRAFT</div>
        <div className="rounded-[10px] border border-[#e8d9b0] bg-[#faf7f0] p-5">
          <div className="text-[13px] font-medium text-[#141413] mb-1">No draft generated</div>
          <p className="text-[12px] text-[#6b6a64] font-serif">{result.note}</p>
        </div>
      </section>
    );
  }
  const d = result.draft;
  return (
    <section className="mb-6">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">DRAFT · {d.wordCount} words</div>
      <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 space-y-4">
        <div>
          <h3 className="text-[17px] font-semibold text-[#141413]">{d.title}</h3>
          <div className="mt-1 text-[12px] text-[#6b6a64]">
            <div><span className="text-[#9a988e]">meta title:</span> {d.metaTitle || "—"}</div>
            <div><span className="text-[#9a988e]">meta description:</span> {d.metaDescription || "—"}</div>
          </div>
        </div>
        {d.outline.length > 0 && (
          <div>
            <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">OUTLINE</div>
            <ul className="text-[12px] text-[#6b6a64] list-disc pl-5 space-y-0.5">
              {d.outline.map((h, i) => (
                <li key={`${i}-${h}`}>{h}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">MARKDOWN</div>
          <pre className="max-h-[420px] overflow-auto rounded-[8px] border border-[#e8e6dc] bg-[#faf9f5] p-3 text-[12px] text-[#141413] whitespace-pre-wrap font-mono leading-relaxed">
            {d.markdown || "(empty)"}
          </pre>
        </div>
      </div>
    </section>
  );
}
