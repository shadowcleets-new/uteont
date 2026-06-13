import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignDetail } from "@/lib/services/campaigns";
import { createClusterAction, setCampaignStatusAction } from "../actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const STATUSES = ["active", "paused", "done", "archived"];

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getCampaignDetail(Number(id)).catch(() => null);
  if (!detail) notFound();
  const { campaign, clusters } = detail;

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <Link href="/campaigns" className="text-[12px] text-[#9a988e] hover:text-[#d97757]">← Campaigns</Link>
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mt-2 mb-1">{campaign.name}</h1>
      {campaign.goal && <p className="text-[13px] text-[#6b6a64] font-serif mb-2">{campaign.goal}</p>}

      <div className="flex items-center gap-2 mb-8">
        {STATUSES.map((s) => (
          <form action={setCampaignStatusAction} key={s}>
            <input type="hidden" name="id" value={campaign.id} />
            <input type="hidden" name="status" value={s} />
            <button
              type="submit"
              aria-pressed={campaign.status === s}
              className={`text-[11px] px-2.5 py-1 rounded-[7px] border transition-colors ${
                campaign.status === s
                  ? "border-[#d97757] bg-[#fbf0eb] text-[#a33b2b] font-semibold"
                  : "border-[#e0ddd2] text-[#6b6a64] hover:border-[#d97757]"
              }`}
            >
              {s}
            </button>
          </form>
        ))}
      </div>

      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">KEYWORD CLUSTERS</div>
      {clusters.length === 0 ? (
        <p className="text-[12px] text-[#9a988e] italic font-serif mb-6">No clusters yet — add one below.</p>
      ) : (
        <div className="space-y-3 mb-8">
          {clusters.map((cl) => (
            <div key={cl.id} className="rounded-[10px] border border-[#e8e6dc] bg-white p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[13px] font-semibold text-[#141413]">{cl.name}</span>
                {cl.intent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#f0eee6] text-[#6b6a64]">{cl.intent}</span>
                )}
                <span className="text-[11px] text-[#9a988e] ml-auto">{cl.keywords.length} keyword(s)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cl.keywords.slice(0, 24).map((k) => (
                  <span key={k} className="text-[11px] px-1.5 py-0.5 rounded bg-[#faf9f5] border border-[#f0eee6] text-[#6b6a64]">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-[10px] border border-[#e8e6dc] bg-white p-5">
        <div className="text-[13px] font-semibold text-[#141413] mb-3">Add a cluster</div>
        <form action={createClusterAction} className="flex flex-col gap-3 max-w-[560px]">
          <input type="hidden" name="campaignId" value={campaign.id} />
          <input
            name="name"
            required
            placeholder="Cluster name — e.g. comparison queries"
            className="text-[13px] rounded-[8px] border border-[#e0ddd2] px-3 py-2 focus:border-[#d97757] focus:outline-none"
          />
          <input
            name="intent"
            placeholder="Intent (informational / commercial / transactional)"
            className="text-[12px] rounded-[8px] border border-[#e0ddd2] px-3 py-2 focus:border-[#d97757] focus:outline-none"
          />
          <textarea
            name="keywords"
            rows={3}
            placeholder="Keywords (one per line)"
            className="text-[12px] rounded-[8px] border border-[#e0ddd2] px-3 py-2 font-mono focus:border-[#d97757] focus:outline-none"
          />
          <button
            type="submit"
            className="self-start text-[13px] px-4 py-2 rounded-[8px] bg-[#d97757] text-white font-medium hover:bg-[#c96846] transition-colors"
          >
            Add cluster →
          </button>
        </form>
      </section>
    </div>
  );
}
