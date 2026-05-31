import Link from "next/link";
import type { NextAction } from "@/lib/services/next-action";

const ACCENT: Record<string, { chip: string; chipFg: string; label: string }> = {
  "off-track": { chip: "#f6e0db", chipFg: "#a33b2b", label: "OFF TRACK" },
  "at-risk": { chip: "#f6ecd6", chipFg: "#8a6516", label: "AT RISK" },
  "on-track": { chip: "#e7efe0", chipFg: "#4a6b2f", label: "ON TRACK" },
  hit: { chip: "#e7efe0", chipFg: "#4a6b2f", label: "HIT" },
};

/** The single highest-priority thing to do now, routed to the agent that moves it. */
export function NextActionCard({ action }: { action: NextAction }) {
  const a = ACCENT[action.status] ?? ACCENT["off-track"];
  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold tracking-wider text-[#9a988e]">NEXT BEST ACTION</span>
        <span
          className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: a.chip, color: a.chipFg }}
        >
          {a.label}
        </span>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-[#141413] truncate">{action.targetTitle}</div>
          <div className="text-[12px] text-[#6b6a64] font-serif mt-1">{action.suggestion}</div>
        </div>
        <Link
          href={action.href}
          className="shrink-0 rounded-[8px] bg-[#d97757] px-4 py-2 text-[12px] font-medium text-white hover:bg-[#c96644] transition-colors whitespace-nowrap"
        >
          {action.cta} →
        </Link>
      </div>
    </div>
  );
}
