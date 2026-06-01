import type { ContentBriefResult } from "@/lib/agent-runners/content-brief";

function Chips({ items, tone }: { items: string[]; tone: "warn" | "neutral" | "good" }) {
  const c =
    tone === "warn"
      ? { bg: "#f6e0db", fg: "#a33b2b" }
      : tone === "good"
        ? { bg: "#e7efe0", fg: "#4a6b2f" }
        : { bg: "#f0eee6", fg: "#6b6a64" };
  if (items.length === 0) return <span className="text-[12px] text-[#9a988e] italic">none</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.fg }}>
          {t}
        </span>
      ))}
    </div>
  );
}

export function ContentBriefReport({ result }: { result: ContentBriefResult }) {
  const scoreColor = result.score >= 80 ? "#788c5d" : result.score >= 50 ? "#c08a2d" : "#a33b2b";
  return (
    <section className="mb-6">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
        CONTENT BRIEF · {result.mode === "competitive" ? `vs ${result.competitorsAnalyzed} competitor(s)` : "baseline"}
      </div>
      <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-[34px] font-semibold leading-none" style={{ color: scoreColor }}>
            {result.score}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[#141413]">
              {result.wordCount} words → recommend <b>{result.recommendedWordCount}</b>
              {result.mode === "competitive" ? ` · info-gain ${result.infoGain}/100` : ""}
            </div>
            <div className="text-[11px] text-[#9a988e] break-all">{result.url}</div>
          </div>
        </div>

        {result.mode === "competitive" && (
          <>
            <div>
              <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">MISSING TERMS (competitors cover, you don&apos;t)</div>
              <Chips items={result.missingTerms} tone="warn" />
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">MISSING TOPICS</div>
              {result.missingTopics.length === 0 ? (
                <span className="text-[12px] text-[#9a988e] italic">none</span>
              ) : (
                <ul className="text-[12px] text-[#6b6a64] list-disc pl-5 space-y-0.5">
                  {result.missingTopics.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div>
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">YOUR TOP TERMS</div>
          <Chips items={result.topTerms} tone="neutral" />
        </div>
        {result.entities.length > 0 && (
          <div>
            <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">ENTITIES</div>
            <Chips items={result.entities} tone="good" />
          </div>
        )}
        {result.checks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 pt-1">
            {result.checks.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-[12px]">
                <span className="font-bold w-3 shrink-0" style={{ color: c.passed ? "#788c5d" : "#a33b2b" }}>
                  {c.passed ? "✓" : "✗"}
                </span>
                <span className="text-[#141413] shrink-0">{c.label}</span>
                <span className="text-[#9a988e] ml-auto truncate text-right" title={c.detail}>
                  {c.detail}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
