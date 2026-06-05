"use client";

import { useMemo, useState, type FormEvent } from "react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  costTier,
  projectedComplexity,
} from "@/lib/targets/cost-projection";

export interface TargetConfig {
  topic: string;
  wordCount: number;
  coverageScore: number;
  primaryKeyword: string;
}

interface TargetConfigFormProps {
  initial?: Partial<TargetConfig>;
  onSubmit?: (config: TargetConfig) => void | Promise<void>;
  submitting?: boolean;
}

const DEFAULTS: TargetConfig = {
  topic: "",
  wordCount: 800,
  coverageScore: 70,
  primaryKeyword: "",
};

const WORD_COUNT_HELP =
  "Defines the length of the written draft. Higher counts require deeper outline generation and increase total token costs.";

const COVERAGE_HELP =
  "Evaluates the draft's topical authority against top-ranking SERP competitors. Aiming for 70+ forces the system to perform exhaustive, multi-step sub-agent searches.";

export function TargetConfigForm({
  initial,
  onSubmit,
  submitting = false,
}: TargetConfigFormProps) {
  const [topic, setTopic] = useState(initial?.topic ?? DEFAULTS.topic);
  const [primaryKeyword, setPrimaryKeyword] = useState(
    initial?.primaryKeyword ?? DEFAULTS.primaryKeyword,
  );
  const [wordCount, setWordCount] = useState(
    initial?.wordCount ?? DEFAULTS.wordCount,
  );
  const [coverageScore, setCoverageScore] = useState(
    initial?.coverageScore ?? DEFAULTS.coverageScore,
  );

  const complexity = useMemo(
    () => projectedComplexity(wordCount, coverageScore),
    [wordCount, coverageScore],
  );
  const tier = useMemo(() => costTier(complexity), [complexity]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!onSubmit) return;
    await onSubmit({ topic, primaryKeyword, wordCount, coverageScore });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target-topic" className="text-[12px]">
            Topic
          </Label>
          <Input
            id="target-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Sourdough starter troubleshooting"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target-keyword" className="text-[12px]">
            Primary keyword
          </Label>
          <Input
            id="target-keyword"
            value={primaryKeyword}
            onChange={(e) => setPrimaryKeyword(e.target.value)}
            placeholder="e.g. sourdough starter not rising"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="target-word-count"
            className="text-[12px] inline-flex items-center gap-1.5"
          >
            Target word count
            <InfoTooltip triggerLabel="Target word count explanation">
              <span className="font-semibold block mb-1">Target Word Count</span>
              {WORD_COUNT_HELP}
            </InfoTooltip>
          </Label>
          <Input
            id="target-word-count"
            type="number"
            min={200}
            max={6000}
            step={100}
            value={wordCount}
            onChange={(e) =>
              setWordCount(Math.max(0, Number(e.target.value) || 0))
            }
          />
          <div className="text-[11px] text-[#9a988e] font-serif italic">
            Default 800 — long-form deep-dives sit between 1500 and 3000.
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="target-coverage"
            className="text-[12px] inline-flex items-center gap-1.5"
          >
            Baseline coverage score
            <InfoTooltip triggerLabel="Baseline coverage score explanation">
              <span className="font-semibold block mb-1">
                Baseline Coverage Score
              </span>
              {COVERAGE_HELP}
            </InfoTooltip>
          </Label>
          <Input
            id="target-coverage"
            type="number"
            min={0}
            max={100}
            step={1}
            value={coverageScore}
            onChange={(e) =>
              setCoverageScore(
                Math.max(0, Math.min(100, Number(e.target.value) || 0)),
              )
            }
          />
          <div className="text-[11px] text-[#9a988e] font-serif italic">
            70+ unlocks deep sub-topic sweeps; 50 is a fast skim.
          </div>
        </div>
      </div>

      <div
        className="rounded-[10px] border border-[#e8e6dc] bg-white px-5 py-4"
        aria-label="Projected run cost"
      >
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !topic || !primaryKeyword}>
          {submitting ? "Saving…" : "Queue target"}
        </Button>
        <span className="text-[11px] text-[#9a988e] font-serif italic">
          Targets are gated through the Director — they enter the Research
          queue only after you confirm.
        </span>
      </div>
    </form>
  );
}
