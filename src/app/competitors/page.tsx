import { CompetitorsWorkspace } from "@/components/competitors/CompetitorsWorkspace";

export const dynamic = "force-dynamic";

/**
 * Milestone 7 — the dedicated Competitors workspace. SERP audits and
 * site-crawler launches now live here instead of crowding the primary
 * dashboard. The directory is currently seeded from in-memory state on
 * the client; persisted competitor records land alongside the
 * Competitor Audit Agent in a follow-up spec.
 */
export default function CompetitorsPage() {
  return (
    <div className="px-9 py-8 max-w-[1200px]">
      <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight mb-1">
        Competitors
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Run on-demand site scans and browse the audited directory. Use the
        Live Site Scraper tab to record a new target; results land in the
        Directory tab once the Competitor Audit Agent crawls them.
      </p>
      <CompetitorsWorkspace initialCompetitors={[]} />
    </div>
  );
}
