import { describe, it, expect } from "vitest";
import { analyzeSiteStructure, type CrawlPage } from "./site-crawl";

const U = "https://s.com";
const page = (key: string, links: string[]): CrawlPage => ({ key, url: U + (key === "/" ? "/" : key), links });

describe("analyzeSiteStructure", () => {
  it("scores a fully interlinked site highly with no orphans", () => {
    const pages = [
      page("/", ["/a", "/b", "/c"]),
      page("/a", ["/", "/b", "/c"]),
      page("/b", ["/", "/a", "/c"]),
      page("/c", ["/", "/a", "/b"]),
    ];
    const r = analyzeSiteStructure({
      entryUrl: U + "/", entryKey: "/", pages, sitemapCount: 4, fetched: { sitemap: true, pages: 4 },
    });
    expect(r.orphanCount).toBe(0);
    expect(r.avgOutbound).toBe(3);
    expect(r.score).toBe(100);
  });

  it("detects an orphan page nothing links to", () => {
    const pages = [
      page("/", ["/a", "/b"]),
      page("/a", ["/", "/b"]),
      page("/b", ["/", "/a"]),
      page("/d", ["/", "/a", "/b"]), // links out, but nothing links in
    ];
    const r = analyzeSiteStructure({
      entryUrl: U + "/", entryKey: "/", pages, sitemapCount: 4, fetched: { sitemap: true, pages: 4 },
    });
    expect(r.orphanCount).toBe(1);
    expect(r.orphans).toContain(U + "/d");
    const ids = r.issues.map((i) => i.id);
    expect(ids).toContain("no_orphans");
    expect(r.issues[0].severity).toBe("high");
    expect(r.score).toBeLessThan(60);
  });

  it("does not count the entry page as an orphan and ignores self-links", () => {
    const pages = [
      page("/", ["/", "/a"]), // self-link should be ignored
      page("/a", ["/"]),
    ];
    const r = analyzeSiteStructure({
      entryUrl: U + "/", entryKey: "/", pages, sitemapCount: 2, fetched: { sitemap: true, pages: 2 },
    });
    // "/" is the entry (exempt); "/a" has an inbound link from "/", so 0 orphans
    expect(r.orphanCount).toBe(0);
  });

  it("returns score 0 when nothing could be fetched", () => {
    const r = analyzeSiteStructure({
      entryUrl: U + "/", entryKey: "/", pages: [], sitemapCount: 0, fetched: { sitemap: false, pages: 0 },
    });
    expect(r.score).toBe(0);
    expect(r.crawled).toBe(0);
  });
});
