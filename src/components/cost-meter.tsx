"use client";

import { useMemo, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import { costTier, projectedComplexity } from "@/lib/targets/cost-projection";

const WORD_COUNT_HELP =
  "Defines the length of the written draft. Higher counts require deeper outline generation and increase total token costs.";

const COVERAGE_HELP =
  "Evaluates the draft's topical authority against top-ranking SERP competitors. Aiming for 70+ forces the system to perform exhaustive, multi-step sub-agent searches.";

const inputCls =
  "w-full rounded-md border border-[#cfccc1] bg-white px-3 py-2 text-[12px] focus:outline-none focus:border-[#d97757] focus:ring-2 focus:ring-[#d97757]/30";

/**
 * Live projected-cost meter (ported from the Milestone-3 line). A planning
 * aid: dial in the draft's word count + coverage ambition and read the
 * token-cost tier before dispatching a run. Self-contained — does not
 * change the run payload.
 */
export function CostMeter() {
  const [wordCount, setWordCount] = useState(800);
  const [coverageScore, setCoverageScore] = useState(70);

  const complexity = useMemo(
    () => projectedComplexity(wordCount, coverageScore),
    [wordCount, coverageScore],
  );
  const tier = useMemo(() => costTier(complexity), [complexity]);

  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4 mb-6">
      <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-3">
        PLAN THE RUN — PROJECTED COST
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="cost-word-count"
            className="text-[12px] text-[#141413] inline-flex items-center gap-1.5"
          >
            Target word count
            <InfoTooltip triggerLabel="Target word count explanation">
              <span className="font-semibold block mb-1">Target Word Count</span>
              {WORD_COUNT_HELP}
            </InfoTooltip>
          </label>
          <input
            id="cost-word-count"
            type="number"
            min={200}
            max={6000}
            step={100}
            value={wordCount}
            onChange={(e) => setWordCount(Math.max(0, Number(e.target.value) || 0))}
            className={inputCls}
          />
          <div className="text-[11px] text-[#9a988e] font-serif italic">
            Default 800 — long-form deep-dives sit between 1500 and 3000.
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="cost-coverage"
            className="text-[12px] text-[#141413] inline-flex items-center gap-1.5"
          >
            Coverage ambition
            <InfoTooltip triggerLabel="Coverage score explanation">
              <span className="font-semibold block mb-1">Coverage Score</span>
              {COVERAGE_HELP}
            </InfoTooltip>
          </label>
          <input
            id="cost-coverage"
            type="number"
            min={0}
            max={100}
            step={1}
            value={coverageScore}
            onChange={(e) =>
              setCoverageScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
            }
            className={inputCls}
          />
          <div className="text-[11px] text-[#9a988e] font-serif italic">
            70+ unlocks deep sub-topic sweeps; 50 is a fast skim.
          </div>
        </div>
      </div>

      <div aria-label="Projected run cost">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <div className="text-[10px] font-bold tracking-wider text-[#9a988e]">
            PROJECTED RUN COST
          </div>
          <div className="text-[11px] text-[#6b6a64] tabular-nums">
            complexity ≈ {Math.round(complexity).toLocaleString()}
          </div>
        </div>
        <div className="h-2 rounded-full bg-[#f3f1ea] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${tier.percent}%`, backgroundColor: tier.fill }}
            data-tier={tier.tier}
          />
        </div>
        <div
          className="mt-2 text-[12px] font-medium tabular-nums"
          style={{ color: tier.fill, fontFamily: "Poppins, Arial, sans-serif" }}
        >
          {tier.label}
        </div>
      </div>
    </div>
  );
}
