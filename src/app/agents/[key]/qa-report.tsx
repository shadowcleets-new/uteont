import type { QaResult } from "@/lib/agent-runners/qa";

const SEV: Record<string, string> = { high: "#a33b2b", med: "#b8862f", low: "#9a988e" };

/** Readable QA report for the latest qa run (score, verdict, issues, metrics). */
export function QaReport({ result }: { result: QaResult }) {
  const m = result.metrics;
  return (
    <section className="mb-6 rounded-[10px] border border-[#e8e6dc] bg-white p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">QA REPORT</div>
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded"
          style={{
            color: result.approved ? "#4a6b2f" : "#a33b2b",
            background: result.approved ? "#eef3e6" : "#f7e9e6",
          }}
        >
          {result.approved ? "Approved" : "Needs work"}
        </span>
        <span className="ml-auto text-[18px] font-semibold text-[#141413] tabular-nums">
          {result.score}
          <span className="text-[11px] text-[#9a988e]"> / 100 (pass ≥ {result.passThreshold})</span>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Metric label="Words" value={String(m.wordCount)} />
        <Metric label="Sentences" value={String(m.sentenceCount)} />
        <Metric label="Reading ease" value={m.fleschReadingEase.toFixed(1)} />
        <Metric label="Passive %" value={`${m.passiveVoicePercent.toFixed(0)}%`} />
        <Metric label="Long sentences" value={String(m.longSentenceCount)} />
      </div>

      {result.issues.length === 0 ? (
        <p className="text-[12px] text-[#4a6b2f]">No issues found.</p>
      ) : (
        <ul className="space-y-1.5">
          {result.issues.map((i, idx) => (
            <li key={idx} className="text-[12px] flex gap-2">
              <span
                className="uppercase text-[10px] font-bold mt-0.5 shrink-0 w-9"
                style={{ color: SEV[i.severity] ?? "#9a988e" }}
              >
                {i.severity}
              </span>
              <span className="text-[#6b6a64]">
                <span className="text-[#141413]">{i.field}</span> — {i.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-[#9a988e] mt-3">
        Plagiarism / factuality: {result.plagiarismStatus.replace("_", " ")}.
      </p>
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
