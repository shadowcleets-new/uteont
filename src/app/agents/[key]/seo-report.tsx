import type { SeoResult } from "@/lib/agent-runners/seo-optimization";

const SEV: Record<string, string> = { high: "#a33b2b", med: "#b8862f", low: "#9a988e" };

/** Readable SEO-lint report for the latest seo-optimization run. */
export function SeoReport({ result }: { result: SeoResult }) {
  const density = Object.entries(result.keywordDensityPercent ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <section className="mb-6 rounded-[10px] border border-[#e8e6dc] bg-white p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">SEO REPORT</div>
        <span className="ml-auto text-[18px] font-semibold text-[#141413] tabular-nums">
          {result.score}
          <span className="text-[11px] text-[#9a988e]"> / 100</span>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Metric label="Title length" value={`${result.titleLength} ch`} />
        <Metric label="Words" value={String(result.wordCount)} />
        <Metric label="Sentences" value={String(result.sentenceCount)} />
        <Metric label="Avg sentence" value={`${result.avgSentenceLength.toFixed(1)} w`} />
      </div>

      {result.issues.length > 0 && (
        <ul className="space-y-1.5 mb-4">
          {result.issues.map((i, idx) => (
            <li key={idx} className="text-[12px] flex gap-2">
              <span className="uppercase text-[10px] font-bold mt-0.5 shrink-0 w-9" style={{ color: SEV[i.severity] ?? "#9a988e" }}>
                {i.severity}
              </span>
              <span className="text-[#6b6a64]">
                <span className="text-[#141413]">{i.field}</span> — {i.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      {result.headingStructure.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">HEADING OUTLINE</div>
          <ul className="text-[12px] text-[#6b6a64] space-y-0.5">
            {result.headingStructure.slice(0, 20).map((h, idx) => (
              <li key={idx} style={{ paddingLeft: `${(h.level - 1) * 14}px` }}>
                <span className="text-[#9a988e]">H{h.level}</span> {h.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {density.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">TOP KEYWORD DENSITY</div>
          <div className="flex flex-wrap gap-1.5">
            {density.map(([term, pct]) => (
              <span key={term} className="text-[11px] rounded bg-[#faf9f5] border border-[#f0eee6] px-2 py-0.5 text-[#6b6a64]">
                {term} <span className="text-[#9a988e] tabular-nums">{pct.toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">
          SUGGESTED META DESCRIPTION ({result.suggestedMetaDescriptionLength} ch)
        </div>
        <p className="text-[12px] text-[#141413] italic mb-3">{result.suggestedMetaDescription}</p>
        <details>
          <summary className="text-[11px] text-[#6b6a64] cursor-pointer">Suggested JSON-LD schema</summary>
          <pre className="mt-2 rounded-[8px] bg-[#faf9f5] border border-[#f0eee6] p-3 text-[11px] overflow-auto max-h-[220px]">
            {JSON.stringify(result.suggestedSchemaJsonld, null, 2)}
          </pre>
        </details>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#f0eee6] bg-[#faf9f5] px-3 py-2">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">{label.toUpperCase()}</div>
      <div className="text-[15px] font-semibold text-[#141413] tabular-nums">{value}</div>
    </div>
  );
}
