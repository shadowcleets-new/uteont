import type { TechnicalSeoResult } from "@/lib/agent-runners/technical-seo";

const SEV_COLOR: Record<string, string> = { high: "#a33b2b", med: "#8a6516", low: "#9a988e" };

export function TechnicalSeoReport({ result }: { result: TechnicalSeoResult }) {
  const scoreColor = result.score >= 80 ? "#788c5d" : result.score >= 50 ? "#c08a2d" : "#a33b2b";
  return (
    <section className="mb-6">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">LATEST AUDIT</div>
      <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="text-[34px] font-semibold leading-none" style={{ color: scoreColor }}>
            {result.score}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[#141413]">
              {result.passed}/{result.total} checks passed
            </div>
            <div className="text-[11px] text-[#9a988e] break-all">{result.url}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
          {result.checks.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-[12px]">
              <span
                className="font-bold w-3 shrink-0"
                style={{ color: c.passed ? "#788c5d" : SEV_COLOR[c.severity] }}
              >
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
