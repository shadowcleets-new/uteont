/**
 * Pipeline state-machine helpers (Milestone 6).
 *
 * The runtime pipeline now consolidates the previously fragmented 10-agent
 * UI into one linear sequence:
 *
 *   1. Setup Target       (cycle created)
 *   2. Live Research       (Research Agent job)
 *   3. Brief & Outline     (Idea Generation job)
 *   4. Writing Engine      (Content Writing job, runs in background)
 *   5. QA & Verification   (QA fn run)
 *   6. SEO Audit           (SEO Optimization fn run)
 *
 * Each step is derived from observable DB state rather than from a
 * separate state column — the source of truth is what's been persisted
 * by the worker + serverless functions. `derivePipelineState` is pure so
 * it can be unit-tested without a database.
 */

export const PIPELINE_STEPS = [
  "setup-target",
  "live-research",
  "brief-outline",
  "writing-engine",
  "qa-verification",
  "seo-audit",
] as const;

export type PipelineStepKey = (typeof PIPELINE_STEPS)[number];

export const PIPELINE_STEP_LABELS: Record<PipelineStepKey, string> = {
  "setup-target": "Setup Target",
  "live-research": "Live Research",
  "brief-outline": "Brief & Outline",
  "writing-engine": "Writing Engine",
  "qa-verification": "QA & Verification",
  "seo-audit": "SEO Audit",
};

export type StepStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineStep {
  key: PipelineStepKey;
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface PipelineSnapshot {
  /** Has the cycle row been created? */
  cycleCreated: boolean;
  /** Counts of keywords by status — drives Live Research step state. */
  keywords: { researched: number; total: number; failing: boolean };
  /** Idea counts by status — drives Brief & Outline. */
  ideas: { proposed: number; approved: number; total: number; failing: boolean };
  /** Article counts by status — drives Writing Engine + QA + SEO. */
  articles: {
    draft: number;
    qaPassed: number;
    approvedOrLater: number;
    total: number;
    failing: boolean;
  };
  /** Set when an agent run is currently 'running' for the matching subject. */
  running: {
    research: boolean;
    idea: boolean;
    writing: boolean;
    qa: boolean;
    seo: boolean;
  };
  /** Last error string surfaced from any step, for hover-tooltip context. */
  lastError?: string | null;
}

export interface PipelineState {
  steps: PipelineStep[];
  currentStep: PipelineStepKey | null;
  failedStep: PipelineStepKey | null;
}

function step(
  key: PipelineStepKey,
  status: StepStatus,
  detail?: string,
): PipelineStep {
  return { key, label: PIPELINE_STEP_LABELS[key], status, detail };
}

export function derivePipelineState(snap: PipelineSnapshot): PipelineState {
  const steps: PipelineStep[] = [];

  // 1 — Setup Target
  steps.push(
    snap.cycleCreated
      ? step("setup-target", "completed", "Cycle created")
      : step("setup-target", "pending"),
  );

  // 2 — Live Research
  if (!snap.cycleCreated) {
    steps.push(step("live-research", "pending"));
  } else if (snap.keywords.failing) {
    steps.push(step("live-research", "failed", "Research agent failed"));
  } else if (snap.running.research) {
    steps.push(step("live-research", "running", "Crawling search signals…"));
  } else if (snap.keywords.researched > 0) {
    steps.push(
      step(
        "live-research",
        "completed",
        `${snap.keywords.researched} keyword${
          snap.keywords.researched === 1 ? "" : "s"
        } harvested`,
      ),
    );
  } else {
    steps.push(step("live-research", "pending"));
  }

  // 3 — Brief & Outline
  if (snap.keywords.researched === 0 && !snap.ideas.total) {
    steps.push(step("brief-outline", "pending"));
  } else if (snap.ideas.failing) {
    steps.push(step("brief-outline", "failed", "Idea generation failed"));
  } else if (snap.running.idea) {
    steps.push(step("brief-outline", "running", "Drafting article briefs…"));
  } else if (snap.ideas.total > 0) {
    steps.push(
      step(
        "brief-outline",
        "completed",
        `${snap.ideas.total} idea${
          snap.ideas.total === 1 ? "" : "s"
        } prepared`,
      ),
    );
  } else {
    steps.push(step("brief-outline", "pending"));
  }

  // 4 — Writing Engine
  if (snap.articles.failing) {
    steps.push(step("writing-engine", "failed", "Writing agent failed"));
  } else if (snap.running.writing) {
    steps.push(step("writing-engine", "running", "Drafting the article…"));
  } else if (snap.ideas.approved === 0 && snap.articles.total === 0) {
    steps.push(step("writing-engine", "pending"));
  } else if (snap.articles.total > 0) {
    steps.push(
      step(
        "writing-engine",
        "completed",
        `${snap.articles.total} draft${
          snap.articles.total === 1 ? "" : "s"
        } written`,
      ),
    );
  } else {
    steps.push(step("writing-engine", "pending"));
  }

  // 5 — QA & Verification
  if (snap.running.qa) {
    steps.push(step("qa-verification", "running", "Validating against targets…"));
  } else if (snap.articles.total === 0) {
    steps.push(step("qa-verification", "pending"));
  } else if (snap.articles.qaPassed > 0 || snap.articles.approvedOrLater > 0) {
    steps.push(
      step(
        "qa-verification",
        "completed",
        `${snap.articles.qaPassed + snap.articles.approvedOrLater} draft${
          snap.articles.qaPassed + snap.articles.approvedOrLater === 1 ? "" : "s"
        } passed QA`,
      ),
    );
  } else if (snap.articles.draft > 0) {
    steps.push(step("qa-verification", "pending"));
  } else {
    steps.push(step("qa-verification", "pending"));
  }

  // 6 — SEO Audit
  if (snap.running.seo) {
    steps.push(step("seo-audit", "running", "Injecting metadata + schema…"));
  } else if (snap.articles.qaPassed === 0 && snap.articles.approvedOrLater === 0) {
    steps.push(step("seo-audit", "pending"));
  } else if (snap.articles.approvedOrLater > 0) {
    steps.push(
      step(
        "seo-audit",
        "completed",
        `${snap.articles.approvedOrLater} ready for approval`,
      ),
    );
  } else {
    steps.push(step("seo-audit", "pending"));
  }

  const currentStep =
    steps.find((s) => s.status === "running")?.key ??
    steps.find((s) => s.status === "pending")?.key ??
    null;
  const failedStep = steps.find((s) => s.status === "failed")?.key ?? null;

  return { steps, currentStep, failedStep };
}
