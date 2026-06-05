import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface PendingApprovalsCardProps {
  count: number;
}

/**
 * Tier-2 Right — quick-access pending-approval surface. Empty state
 * routes to the approvals queue regardless so the user can browse the
 * shelf without something needing review.
 */
export function PendingApprovalsCard({ count }: PendingApprovalsCardProps) {
  const tone =
    count === 0 ? "ok" : count < 5 ? "warn" : "err";
  const colorMap = { ok: "#788c5d", warn: "#d97757", err: "#a33b2b" } as const;
  return (
    <Link
      href="/keywords?status=proposed"
      className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 flex flex-col gap-2 hover:border-[#d97757] hover:bg-[#faf9f5] transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
          PENDING APPROVALS
        </div>
        <ArrowUpRight
          aria-hidden
          className="h-4 w-4 text-[#9a988e] group-hover:text-[#d97757] transition-colors"
        />
      </div>
      <div
        className="text-[28px] font-semibold tabular-nums"
        style={{
          color: colorMap[tone],
          fontFamily: "Poppins, Arial, sans-serif",
        }}
      >
        {count}
      </div>
      <div className="text-[11px] text-[#9a988e] font-serif italic">
        {count === 0
          ? "Inbox zero — nothing waiting on you."
          : `Ideas and articles awaiting your gate decision.`}
      </div>
    </Link>
  );
}
