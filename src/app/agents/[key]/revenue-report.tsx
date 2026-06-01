import type { RevenueResult } from "@/lib/agent-runners/revenue";

const SEV_COLOR: Record<string, string> = { high: "#a33b2b", med: "#8a6516", low: "#9a988e" };

export function RevenueReport({ result }: { result: RevenueResult }) {
  const scoreColor = result.score >= 80 ? "#788c5d" : result.score >= 50 ? "#c08a2d" : "#a33b2b";
  const passed = result.checks.filter((c) => c.passed).length;
  return (
    <section className="mb-6">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">LATEST CONVERSION AUDIT</div>
      <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="text-[34px] font-semibold leading-none" style={{ color: scoreColor }}>
            {result.score}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[#141413]">{passed}/{result.checks.length} checks passed</div>
            <div className="text-[11px] text-[#9a988e] break-all">{result.url}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Mini label="CTAs" value={String(result.counts.ctas)} />
          <Mini label="MONEY LINKS" value={String(result.counts.moneyLinks)} />
          <Mini label="LEAD FORMS" value={String(result.counts.forms)} />
          <Mini label="TRUST SIGNALS" value={String(result.counts.trustSignals)} />
        </div>
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#e8e6dc] bg-[#faf9f5] px-3 py-2">
      <div className="text-[9px] font-bold tracking-wider text-[#9a988e]">{label}</div>
      <div className="text-[15px] font-semibold text-[#141413] mt-0.5">{value}</div>
    </div>
  );
}
