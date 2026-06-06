import Link from "next/link";
import { ExclusionsPanel } from "@/components/exclusions/ExclusionsPanel";
import { listSites } from "@/lib/services/sites";
import { listExclusions } from "@/lib/services/keyword-exclusions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ siteId?: string }>;
}

export default async function ExclusionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sites = await listSites().catch(() => []);
  const requested = sp.siteId ? Number(sp.siteId) : null;
  const active =
    sites.find((s) => s.id === requested) ?? sites[0] ?? null;

  const exclusions = active
    ? (await listExclusions(active.id).catch(() => [])).map((r) => ({
        id: r.id,
        phrase: r.phrase,
        reason: r.reason,
        source: r.source,
        createdAt: r.createdAt
          ? new Date(r.createdAt as unknown as string).toISOString()
          : null,
      }))
    : [];

  return (
    <div className="px-9 py-8 max-w-[1000px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-1">
        Exclusions
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Closed-loop feedback into the Research and Ideation agents.
        Anything listed here is suppressed from future runs — both as a
        prompt-time directive and a post-LLM filter.
      </p>

      {sites.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[#cfccc1] bg-white px-6 py-10 text-center">
          <p className="text-[13px] text-[#6b6a64] font-serif italic">
            Add a site first — exclusions are scoped per site so the
            negative-prompt block fires only on the right runs.
          </p>
        </div>
      ) : (
        <>
          <nav
            aria-label="Sites"
            className="mb-4 flex flex-wrap items-center gap-1 text-[11px]"
          >
            {sites.map((s) => (
              <Link
                key={s.id}
                href={`/exclusions?siteId=${s.id}`}
                className={
                  s.id === active?.id
                    ? "rounded-full border border-[#d97757] bg-[#fef3eb] text-[#a33b2b] px-2.5 py-1"
                    : "rounded-full border border-[#e8e6dc] bg-white text-[#6b6a64] hover:border-[#cfccc1] px-2.5 py-1 transition-colors"
                }
              >
                {s.name}
              </Link>
            ))}
          </nav>
          {active && (
            <ExclusionsPanel siteId={active.id} initial={exclusions} />
          )}
        </>
      )}
    </div>
  );
}
