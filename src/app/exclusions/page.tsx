import { getDb } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getActiveSiteId } from "@/lib/services/app-settings";
import { listExclusions } from "@/lib/services/keyword-exclusions";
import { ExclusionsPanel } from "@/components/exclusions-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exclusions — UTEONT" };

function Header({ siteName }: { siteName?: string }) {
  return (
    <>
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-2">
        Exclusions
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Closed-loop negative feedback{siteName ? ` for ${siteName}` : ""}.
        Anything listed here is suppressed from future runs — as a
        prompt-time directive on research/ideation dispatches and as a
        deterministic filter on incoming keywords.
      </p>
    </>
  );
}

export default async function ExclusionsPage() {
  const activeSiteId = await getActiveSiteId().catch(() => null);

  if (!activeSiteId) {
    return (
      <div className="px-9 py-8 max-w-[1000px]">
        <Header />
        <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
          <p className="text-[12px] text-[#9a988e] italic font-serif">
            Select a site (top-left) to manage its exclusion list.
          </p>
        </div>
      </div>
    );
  }

  const db = getDb();
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.id, activeSiteId))
    .limit(1);

  const exclusions = (await listExclusions(activeSiteId).catch(() => [])).map(
    (r) => ({
      id: r.id,
      phrase: r.phrase,
      reason: r.reason,
      source: r.source,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    }),
  );

  return (
    <div className="px-9 py-8 max-w-[1000px]">
      <Header siteName={site?.name} />
      <ExclusionsPanel siteId={activeSiteId} initial={exclusions} />
    </div>
  );
}
