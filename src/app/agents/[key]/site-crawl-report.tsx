import type { SiteCrawlResult } from "@/lib/agent-runners/site-crawl";

const SEV_COLOR: Record<string, string> = { high: "#a33b2b", med: "#8a6516", low: "#9a988e" };

export function SiteCrawlReport({ result }: { result: SiteCrawlResult }) {
  const scoreColor = result.score >= 80 ? "#788c5d" : result.score >= 50 ? "#c08a2d" : "#a33b2b";
  const passed = result.checks.filter((c) => c.passed).length;
  return (
    <section className="mb-6">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">LATEST CRAWL</div>
      <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="text-[34px] font-semibold leading-none" style={{ color: scoreColor }}>
            {result.score}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[#141413]">
              {passed}/{result.checks.length} checks passed · {result.crawled} pages crawled
            </div>
            <div className="text-[11px] text-[#9a988e] break-all">{result.entryUrl}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Mini label="ORPHAN PAGES" value={String(result.orphanCount)} tone={result.orphanCount > 0 ? "warn" : "ok"} />
          <Mini label="THIN PAGES" value={String(result.thinCount)} />
          <Mini label="AVG INTERNAL LINKS" value={result.avgOutbound.toFixed(1)} />
          <Mini label="AVG INBOUND" value={result.avgInbound.toFixed(1)} />
        </div>
        {result.orphans.length > 0 && (
          <div className="mb-4 rounded-[8px] border border-[#f0d9d2] bg-[#fbf2ef] p-3">
            <div className="text-[10px] font-bold tracking-wider text-[#a33b2b] mb-1">
              ORPHAN PAGES — nothing links to these
            </div>
            <ul className="text-[11px] text-[#6b6a64] space-y-0.5">
              {result.orphans.map((u) => (
                <li key={u} className="truncate">{u}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
          {result.checks.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-[12px]">
              <span className="font-bold w-3 shrink-0" style={{ color: c.passed ? "#788c5d" : SEV_COLOR[c.severity] }}>
                {c.passed ? "✓" : "✗"}
              </span>
              <span className="text-[#141413] shrink-0">{c.label}</span>
              <span className="text-[#9a988e] ml-auto truncate text-right" title={c.detail}>
                {c.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "ok" | "warn" | "neutral" }) {
  const color = tone === "warn" ? "#a33b2b" : tone === "ok" ? "#788c5d" : "#141413";
  return (
    <div className="rounded-[8px] border border-[#e8e6dc] bg-[#faf9f5] px-3 py-2">
      <div className="text-[9px] font-bold tracking-wider text-[#9a988e]">{label}</div>
      <div className="text-[15px] font-semibold mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}
