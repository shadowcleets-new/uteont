"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { LiveSiteScraper } from "./LiveSiteScraper";
import {
  CompetitorDirectory,
  type CompetitorRow,
} from "./CompetitorDirectory";

type TabKey = "scraper" | "directory";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "scraper", label: "Live Site Scraper" },
  { key: "directory", label: "Competitor Directory" },
];

interface CompetitorsWorkspaceProps {
  initialCompetitors: CompetitorRow[];
}

export function CompetitorsWorkspace({
  initialCompetitors,
}: CompetitorsWorkspaceProps) {
  const [active, setActive] = useState<TabKey>("scraper");

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Competitors workspace tabs"
        className="flex items-center gap-1 border-b border-[#e8e6dc]"
      >
        {TABS.map((tab) => {
          const selected = active === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={selected}
              aria-controls={`competitors-panel-${tab.key}`}
              type="button"
              onClick={() => setActive(tab.key)}
              className={cn(
                "px-3 py-2 text-[12px] font-medium transition-colors -mb-px border-b-2",
                selected
                  ? "border-[#d97757] text-[#141413]"
                  : "border-transparent text-[#6b6a64] hover:text-[#141413]",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id="competitors-panel-scraper"
        role="tabpanel"
        hidden={active !== "scraper"}
      >
        {active === "scraper" && <LiveSiteScraper />}
      </div>

      <div
        id="competitors-panel-directory"
        role="tabpanel"
        hidden={active !== "directory"}
      >
        {active === "directory" && (
          <CompetitorDirectory competitors={initialCompetitors} />
        )}
      </div>
    </div>
  );
}
