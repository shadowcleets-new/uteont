import { listDecisions } from "@/lib/services/decision-records";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cannibalization — UTEONT" };

/**
 * IP-42 — keyword cannibalization findings. The daily cron pulls per-(page, query)
 * GSC rows, runs detectCannibalization(), and records a `loop.cannibalization`
 * warning decision per query that 2+ of our pages compete for. This page is a
 * read-only view over those decisions (defensive — empty until the cron has run
 * with Search Console connected).
 */
export default async function CannibalizationPage() {
  const all = await listDecisions({ kind: "warning" });
  const findings = all.filter((d) => d.subjectKey === "loop.cannibalization");

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">Cannibalization</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Queries where two or more of your own pages compete for the same search — splitting
        authority and clicks. Detected from Google Search Console per-(page, query) data on the
        daily cron. Consolidate the duplicates, or differentiate their intent.
      </p>

      {findings.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            No cannibalization detected yet — findings appear here after the daily cron runs with
            Search Console connected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {findings.map((d) => (
            <div key={d.id} className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#f6e9e4] text-[#a33b2b]">
                  WARNING
                </span>
                <span className="text-[11px] text-[#9a988e]">{d.subjectKey}</span>
              </div>
              <h3 className="text-[15px] font-semibold text-[#141413]">{d.title}</h3>
              {d.rationale && <p className="text-[12px] text-[#6b6a64] mt-1 font-serif">{d.rationale}</p>}
              {Array.isArray(d.evidence) && d.evidence.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1.5">COMPETING PAGES</div>
                  <ul className="text-[12px] text-[#6b6a64] space-y-0.5">
                    {d.evidence.slice(0, 12).map((e, i) => (
                      <li key={i}>
                        <span className="text-[#141413]">{e.label}</span>
                        {e.value ? <span className="text-[#9a988e]"> — {e.value}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
