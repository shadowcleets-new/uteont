import type { PerformanceResult } from "@/lib/agent-runners/performance-tracking";

const fmt = (n?: number) => (typeof n === "number" ? n.toLocaleString() : "—");

export function PerformanceReport({ result }: { result: PerformanceResult }) {
  if (!result.configured) {
    return (
      <section className="mb-6">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">SEARCH CONSOLE</div>
        <div className="rounded-[10px] border border-[#e8d9b0] bg-[#faf7f0] p-5">
          <div className="text-[13px] font-medium text-[#141413] mb-1">Not connected yet</div>
          <p className="text-[12px] text-[#6b6a64] font-serif">{result.note}</p>
          <a
            href="/api/integrations/gsc/connect"
            className="inline-block mt-3 text-[12px] text-[#d97757] hover:underline"
          >
            Connect Search Console →
          </a>
        </div>
      </section>
    );
  }
  const range = result.range ? `${result.range.startDate} → ${result.range.endDate}` : "";
  return (
    <section className="mb-6">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
        SEARCH CONSOLE{range ? ` · ${range}` : ""}
      </div>
      <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="CLICKS" value={fmt(result.clicks)} />
        <Metric label="IMPRESSIONS" value={fmt(result.impressions)} />
        <Metric label="CTR" value={typeof result.ctr === "number" ? `${(result.ctr * 100).toFixed(2)}%` : "—"} />
        <Metric label="AVG POSITION" value={typeof result.position === "number" ? result.position.toFixed(1) : "—"} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#e8e6dc] bg-[#faf9f5] px-3 py-2">
      <div className="text-[9px] font-bold tracking-wider text-[#9a988e]">{label}</div>
      <div className="text-[18px] font-semibold text-[#141413] mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
