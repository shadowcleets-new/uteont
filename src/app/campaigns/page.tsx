import Link from "next/link";
import { listCampaigns, listClusters } from "@/lib/services/campaigns";
import { createCampaignAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns — UTEONT" };

const STATUS_COLORS: Record<string, string> = {
  active: "#788c5d",
  paused: "#8a6516",
  done: "#3d6b35",
  archived: "#9a988e",
};

export default async function CampaignsPage() {
  const [campaigns, looseClusters] = await Promise.all([
    listCampaigns().catch(() => []),
    listClusters().catch(() => []),
  ]);
  const clusterCount = (id: number) => looseClusters.filter((c) => c.campaignId === id).length;

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">Campaigns</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Group keyword clusters under one themed goal and run a coordinated push, instead of juggling
        flat per-site targets.
      </p>

      <section className="rounded-[10px] border border-[#e8e6dc] bg-white p-5 mb-8">
        <div className="text-[13px] font-semibold text-[#141413] mb-3">New campaign</div>
        <form action={createCampaignAction} className="flex flex-col gap-3 max-w-[560px]">
          <input
            name="name"
            required
            placeholder="Name — e.g. Q3 buyer-intent push"
            className="text-[13px] rounded-[8px] border border-[#e0ddd2] px-3 py-2 focus:border-[#d97757] focus:outline-none"
          />
          <input
            name="goal"
            placeholder="Goal (optional)"
            className="text-[13px] rounded-[8px] border border-[#e0ddd2] px-3 py-2 focus:border-[#d97757] focus:outline-none"
          />
          <button
            type="submit"
            className="self-start text-[13px] px-4 py-2 rounded-[8px] bg-[#d97757] text-white font-medium hover:bg-[#c96846] transition-colors"
          >
            Create campaign →
          </button>
        </form>
      </section>

      {campaigns.length === 0 ? (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">No campaigns yet — create one above.</p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white overflow-hidden">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="flex items-center gap-3 px-5 py-3 border-t border-[#f3f1ea] first:border-t-0 hover:bg-[#faf9f5] transition-colors"
            >
              <span
                className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full text-white shrink-0"
                style={{ background: STATUS_COLORS[c.status] ?? STATUS_COLORS.archived }}
              >
                {c.status.toUpperCase()}
              </span>
              <span className="text-[13px] text-[#141413] font-medium truncate">{c.name}</span>
              <span className="text-[11px] text-[#9a988e] ml-auto shrink-0">{clusterCount(c.id)} cluster(s)</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
