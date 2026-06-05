import { listPendingApprovals } from "@/lib/services/approvals-queue";
import { ApprovalsWorkspace } from "@/components/approvals/ApprovalsWorkspace";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const items = await listPendingApprovals();

  return (
    <div className="px-9 py-8 max-w-[1400px]">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight">
          Approvals
        </h1>
        <span className="text-[12px] text-[#6b6a64] tabular-nums">
          {items.length} item{items.length === 1 ? "" : "s"} pending
        </span>
      </div>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Ideas waiting on gate A and articles waiting on gate B. Approve to
        publish, shelf to park without rejecting, or send back with notes
        the writing agent will read on its next pass.
      </p>
      <ApprovalsWorkspace initial={items} />
    </div>
  );
}
