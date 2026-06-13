import Link from "next/link";
import { listCycles } from "@/lib/services/cycles";
import { createCycleAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cycles — UTEONT" };

const STATUS_COLORS: Record<string, string> = {
  researching: "#5a7d9a",
  "ideas-ready": "#8a6516",
  drafting: "#d97757",
  qa: "#7a5a9a",
  staged: "#788c5d",
  published: "#3d6b35",
  archived: "#9a988e",
};

export default async function CyclesPage() {
  const cycles = await listCycles({ limit: 100 }).catch(() => []);

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">Cycles</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        A cycle is one research-to-publish run. Everything the pipeline produces — keywords, ideas,
        drafts, jobs, runs — is tagged to its cycle.
      </p>

      <section className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 mb-8">
        <div className="text-[13px] font-semibold text-[#141413] mb-3">New cycle</div>
        <form action={createCycleAction} className="flex flex-col gap-3 max-w-[560px]">
          <input
            name="goal"
            required
            placeholder="Goal — e.g. rank top-3 for “textile manufacturing”"
            className="text-[13px] rounded-[8px] border border-[#e0ddd2] px-3 py-2 focus:border-[#d97757] focus:outline-none"
          />
          <textarea
            name="seedTerms"
            rows={2}
            placeholder="Seed terms (one per line, optional)"
            className="text-[12px] rounded-[8px] border border-[#e0ddd2] px-3 py-2 font-mono focus:border-[#d97757] focus:outline-none"
          />
          <button
            type="submit"
            className="self-start text-[13px] px-4 py-2 rounded-[8px] bg-[#d97757] text-white font-medium hover:bg-[#c96846] transition-colors"
          >
            Create cycle →
          </button>
        </form>
      </section>

      {cycles.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">No cycles yet — create one above.</p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
          {cycles.map((c) => (
            <Link
              key={c.id}
              href={`/cycles/${c.id}`}
              className="flex items-center gap-3 px-5 py-3 border-t border-[#f3f1ea] first:border-t-0 hover:bg-[#faf9f5] transition-colors"
            >
              <span
                className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full text-white shrink-0"
                style={{ background: STATUS_COLORS[c.status] ?? STATUS_COLORS.archived }}
              >
                {c.status.toUpperCase()}
              </span>
              <span className="text-[13px] text-[#141413] font-medium truncate">{c.goal}</span>
              <span className="text-[11px] text-[#9a988e] ml-auto shrink-0">#{c.id}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
