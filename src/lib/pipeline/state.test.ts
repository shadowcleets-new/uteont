import { describe, it, expect } from "vitest";
import {
  derivePipelineState,
  PIPELINE_STEPS,
  type PipelineSnapshot,
} from "./state";

const blankSnap = (): PipelineSnapshot => ({
  cycleCreated: false,
  keywords: { researched: 0, total: 0, failing: false },
  ideas: { proposed: 0, approved: 0, total: 0, failing: false },
  articles: {
    draft: 0,
    qaPassed: 0,
    approvedOrLater: 0,
    total: 0,
    failing: false,
  },
  running: {
    research: false,
    idea: false,
    writing: false,
    qa: false,
    seo: false,
  },
});

describe("derivePipelineState", () => {
  it("returns 6 steps in canonical order", () => {
    const out = derivePipelineState(blankSnap());
    expect(out.steps.map((s) => s.key)).toEqual([...PIPELINE_STEPS]);
  });

  it("marks every step pending on a blank snapshot", () => {
    const out = derivePipelineState(blankSnap());
    expect(out.steps.every((s) => s.status === "pending")).toBe(true);
    expect(out.currentStep).toBe("setup-target");
  });

  it("transitions setup -> live-research once the cycle is created", () => {
    const snap = blankSnap();
    snap.cycleCreated = true;
    const out = derivePipelineState(snap);
    expect(out.steps[0].status).toBe("completed");
    expect(out.steps[1].status).toBe("pending");
    expect(out.currentStep).toBe("live-research");
  });

  it("marks live-research running when its agent is running", () => {
    const snap = blankSnap();
    snap.cycleCreated = true;
    snap.running.research = true;
    const out = derivePipelineState(snap);
    expect(out.steps[1].status).toBe("running");
    expect(out.currentStep).toBe("live-research");
  });

  it("marks live-research completed when keywords land", () => {
    const snap = blankSnap();
    snap.cycleCreated = true;
    snap.keywords.researched = 7;
    snap.keywords.total = 7;
    const out = derivePipelineState(snap);
    expect(out.steps[1].status).toBe("completed");
    expect(out.steps[1].detail).toMatch(/7 keywords harvested/);
    expect(out.currentStep).toBe("brief-outline");
  });

  it("surfaces failure with detail when an agent stage failed", () => {
    const snap = blankSnap();
    snap.cycleCreated = true;
    snap.keywords.researched = 10;
    snap.ideas.total = 5;
    snap.ideas.failing = true;
    const out = derivePipelineState(snap);
    expect(out.steps[2].status).toBe("failed");
    expect(out.failedStep).toBe("brief-outline");
  });

  it("advances through writing, qa, seo on accumulating outputs", () => {
    const snap = blankSnap();
    snap.cycleCreated = true;
    snap.keywords.researched = 5;
    snap.ideas.total = 3;
    snap.ideas.approved = 3;
    snap.articles.total = 2;
    snap.articles.draft = 0;
    snap.articles.qaPassed = 2;
    const out = derivePipelineState(snap);
    expect(out.steps[3].status).toBe("completed");
    expect(out.steps[4].status).toBe("completed");
    expect(out.steps[5].status).toBe("pending");
    expect(out.currentStep).toBe("seo-audit");
  });

  it("marks seo completed once at least one draft is approved or beyond", () => {
    const snap = blankSnap();
    snap.cycleCreated = true;
    snap.keywords.researched = 5;
    snap.ideas.total = 1;
    snap.articles.total = 1;
    snap.articles.qaPassed = 0;
    snap.articles.approvedOrLater = 1;
    const out = derivePipelineState(snap);
    expect(out.steps[5].status).toBe("completed");
    expect(out.currentStep).toBeNull();
  });

  it("prefers a running step over a pending one as currentStep", () => {
    const snap = blankSnap();
    snap.cycleCreated = true;
    snap.keywords.researched = 3;
    snap.ideas.total = 1;
    snap.running.writing = true;
    const out = derivePipelineState(snap);
    expect(out.steps[3].status).toBe("running");
    expect(out.currentStep).toBe("writing-engine");
  });
});
