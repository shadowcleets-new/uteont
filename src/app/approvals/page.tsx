import { listCheckpoints } from "@/lib/services/checkpoints";
import { ApprovalsClient, type CheckpointView } from "./approvals-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approvals — UTEONT" };

export default async function ApprovalsPage() {
  const pending = await listCheckpoints({ status: "pending" });
  const items: CheckpointView[] = pending.map((c) => ({
    id: c.id,
    gate: c.gate,
    title: c.title,
    summary: c.summary ?? null,
    blastRadius: c.blastRadius,
    createdAt: (c.createdAt as Date)?.toISOString?.() ?? String(c.createdAt),
  }));

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">Approvals</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Human-in-the-loop checkpoints awaiting your decision. The bigger the blast radius (how many
        items an action touches), the more deliberate the confirmation required.
      </p>
      <ApprovalsClient initial={items} />
    </div>
  );
}
