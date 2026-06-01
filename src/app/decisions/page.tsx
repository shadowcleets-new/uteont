import { listDecisions, confidenceLabel } from "@/lib/services/decision-records";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decisions — UTEONT" };

export default async function DecisionsPage() {
  const decisions = await listDecisions();
  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">Decisions</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Explainability log — why each agent or the Director made a choice: the rationale, its
        confidence, and the evidence it weighed.
      </p>

      {decisions.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            No decisions recorded yet — they appear here as agents run and explain their reasoning.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {decisions.map((d) => {
            const conf = confidenceLabel(d.confidence);
            return (
              <div key={d.id} className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#f0eee6] text-[#6b6a64]">
                    {d.kind.toUpperCase()}
                  </span>
                  <span className="text-[11px] text-[#9a988e]">{d.subjectKey}</span>
                </div>
                <h3 className="text-[15px] font-semibold text-[#141413]">{d.title}</h3>
                {d.rationale && <p className="text-[12px] text-[#6b6a64] mt-1 font-serif">{d.rationale}</p>}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">CONFIDENCE</span>
                  <div className="h-1.5 w-28 rounded-full bg-[#f0eee6] overflow-hidden">
                    <div className="h-full rounded-full bg-[#9bb87a]" style={{ width: `${conf.pct}%` }} />
                  </div>
                  <span className="text-[11px] text-[#6b6a64]">{conf.label} ({conf.pct}%)</span>
                </div>
                {Array.isArray(d.evidence) && d.evidence.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">EVIDENCE</div>
                    <ul className="text-[12px] text-[#6b6a64] space-y-0.5">
                      {d.evidence.slice(0, 12).map((e, i) => (
                        <li key={i}>
                          <span className="text-[#141413]">{e.label}</span>
                          {e.value ? `: ${e.value}` : ""}
                          {e.source ? <span className="text-[#9a988e]"> — {e.source}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
