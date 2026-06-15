import { monthToDateCost, getMonthlyCapUsd, isOverCap } from "@/lib/services/cost-ledger";

export const dynamic = "force-dynamic";
export const metadata = { title: "Spend — UTEONT" };

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

export default async function SpendPage() {
  const agg = await monthToDateCost();
  const cap = await getMonthlyCapUsd();
  const over = isOverCap(agg.total.costUsd, cap);
  const agents = Object.entries(agg.byAgent).sort((a, b) => b[1].costUsd - a[1].costUsd);

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">Spend</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Month-to-date token + cost ledger (IP-14), aggregated from every run&apos;s recorded usage. A monthly
        cap (set in <code className="text-[12px]">kv_settings.monthly_cost_cap_usd</code>) pauses generative
        agents once breached.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1">MONTH-TO-DATE COST</div>
          <div className="text-[24px] font-semibold text-[#141413]">{usd(agg.total.costUsd)}</div>
        </div>
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1">TOKENS</div>
          <div className="text-[24px] font-semibold text-[#141413]">{fmtTokens(agg.total.tokens)}</div>
        </div>
        <div
          className={`rounded-[10px] border p-5 ${over ? "border-[#a33b2b] bg-[#fbf0ee]" : "border-[#e8e6dc] bg-white"}`}
        >
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1">MONTHLY CAP</div>
          <div className={`text-[24px] font-semibold ${over ? "text-[#a33b2b]" : "text-[#141413]"}`}>
            {cap == null ? "—" : usd(cap)}
          </div>
          {over && <div className="text-[11px] text-[#a33b2b] mt-1">Cap exceeded — generative agents paused.</div>}
        </div>
      </div>

      <h2 className="text-[13px] font-bold tracking-wider text-[#9a988e] mb-3">BY AGENT</h2>
      {agents.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            No recorded spend this month yet — cost accrues here as agents with usage telemetry run.
          </p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#e8e6dc] text-[#9a988e]">
                <th className="text-left font-medium px-5 py-2.5">Agent</th>
                <th className="text-right font-medium px-5 py-2.5">Tokens</th>
                <th className="text-right font-medium px-5 py-2.5">Cost</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(([agent, t]) => (
                <tr key={agent} className="border-b border-[#f3f1ea] last:border-0">
                  <td className="px-5 py-2.5 text-[#141413]">{agent || "—"}</td>
                  <td className="px-5 py-2.5 text-right text-[#6b6a64]">{fmtTokens(t.tokens)}</td>
                  <td className="px-5 py-2.5 text-right text-[#6b6a64]">{usd(t.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
