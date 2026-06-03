import { describe, it, expect } from "vitest";
import { runsToInterventions } from "./run-interventions";

const T = Date.parse("2026-06-01T00:00:00.000Z");

describe("runsToInterventions", () => {
  it("maps a run to an intervention with startedAt-ms + status label", () => {
    const out = runsToInterventions([{ startedAt: new Date(T), status: "success" }], "Technical SEO");
    expect(out).toEqual([{ atMs: T, label: "Technical SEO — success" }]);
  });

  it("includes failure and running runs (each is an operator action on the target)", () => {
    const out = runsToInterventions(
      [
        { startedAt: new Date(T), status: "failure" },
        { startedAt: new Date(T + 1000), status: "running" },
      ],
      "Research",
    );
    expect(out.map((i) => i.label)).toEqual(["Research — failure", "Research — running"]);
  });

  it("accepts ISO strings and epoch numbers for startedAt", () => {
    expect(runsToInterventions([{ startedAt: new Date(T).toISOString(), status: "success" }], "X")[0].atMs).toBe(T);
    expect(runsToInterventions([{ startedAt: T, status: "success" }], "X")[0].atMs).toBe(T);
  });

  it("skips runs with null or invalid startedAt", () => {
    const out = runsToInterventions(
      [
        { startedAt: null, status: "success" },
        { startedAt: "not-a-date", status: "success" },
        { startedAt: new Date(T), status: "success" },
      ],
      "X",
    );
    expect(out).toHaveLength(1);
  });

  it("returns [] for no runs", () => {
    expect(runsToInterventions([], "X")).toEqual([]);
  });
});
