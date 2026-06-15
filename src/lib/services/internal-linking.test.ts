import { describe, it, expect } from "vitest";
import { recommendInternalLinks, type LinkGraph } from "./internal-linking";

// A small site graph. /hub is the highest-authority page, /post-a next, then the rest.
const graph: LinkGraph = {
  pages: [
    { url: "/hub", outlinks: ["/post-a"], inlinks: 50 },
    { url: "/post-a", outlinks: ["/target"], inlinks: 20 }, // already links to target
    { url: "/post-b", outlinks: [], inlinks: 10 },
    { url: "/post-c", outlinks: [], inlinks: 5 },
    { url: "/target", outlinks: [], inlinks: 1 },
  ],
};

describe("recommendInternalLinks", () => {
  it("recommends a link from a high-authority page that does not already link to the target", () => {
    const recs = recommendInternalLinks(graph, ["/target"]);
    expect(recs.length).toBeGreaterThan(0);
    const top = recs[0]!;
    expect(top.from).toBe("/hub");
    expect(top.to).toBe("/target");
    expect(top.sourceAuthority).toBe(50);
    expect(top.reason).toContain("/target");
  });

  it("excludes a page that already links to the target", () => {
    const recs = recommendInternalLinks(graph, ["/target"]);
    // /post-a already has /target in its outlinks -> never recommended.
    expect(recs.some((r) => r.from === "/post-a")).toBe(false);
  });

  it("excludes the target itself as a source", () => {
    const recs = recommendInternalLinks(graph, ["/target"]);
    expect(recs.some((r) => r.from === "/target")).toBe(false);
  });

  it("respects maxPerTarget (2 -> at most 2 recs per target)", () => {
    const recs = recommendInternalLinks(graph, ["/target"], { maxPerTarget: 2 });
    const forTarget = recs.filter((r) => r.to === "/target");
    expect(forTarget.length).toBe(2);
  });

  it("ranks higher-inlink sources first", () => {
    const recs = recommendInternalLinks(graph, ["/target"]);
    const authorities = recs.map((r) => r.sourceAuthority);
    // Descending order: /hub(50), /post-b(10), /post-c(5).
    expect(authorities).toEqual([...authorities].sort((a, b) => b - a));
    expect(recs.map((r) => r.from)).toEqual(["/hub", "/post-b", "/post-c"]);
  });

  it("skips targets that have no candidate sources", () => {
    // Every other page already links to /isolated -> no candidates.
    const g: LinkGraph = {
      pages: [
        { url: "/isolated", outlinks: [], inlinks: 0 },
        { url: "/x", outlinks: ["/isolated"], inlinks: 9 },
      ],
    };
    expect(recommendInternalLinks(g, ["/isolated"])).toEqual([]);
  });

  it("ignores target urls that do not exist as nodes", () => {
    expect(recommendInternalLinks(graph, ["/does-not-exist"])).toEqual([]);
  });

  it("tie-breaks equal authority by url alphabetically", () => {
    const g: LinkGraph = {
      pages: [
        { url: "/target", outlinks: [], inlinks: 0 },
        { url: "/zed", outlinks: [], inlinks: 7 },
        { url: "/alpha", outlinks: [], inlinks: 7 },
      ],
    };
    const recs = recommendInternalLinks(g, ["/target"]);
    expect(recs.map((r) => r.from)).toEqual(["/alpha", "/zed"]);
  });

  it("treats a missing inlinks field as 0 authority", () => {
    const g: LinkGraph = {
      pages: [
        { url: "/target", outlinks: [] },
        { url: "/no-inlinks", outlinks: [] },
      ],
    };
    const recs = recommendInternalLinks(g, ["/target"]);
    expect(recs[0]!.from).toBe("/no-inlinks");
    expect(recs[0]!.sourceAuthority).toBe(0);
  });
});
