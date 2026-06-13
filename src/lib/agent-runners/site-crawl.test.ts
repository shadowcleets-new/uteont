import { describe, it, expect } from "vitest";
import { analyzeSiteStructure, isBlockedHost, type CrawlPage } from "./site-crawl";

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

describe("isBlockedHost", () => {
  it("blocks loopback, private ranges, link-local/metadata, and .local", () => {
    for (const h of [
      "localhost", "sub.localhost", "127.0.0.1", "127.8.9.1", "0.0.0.0",
      "10.1.2.3", "192.168.0.10", "172.16.0.1", "172.31.255.255",
      "169.254.169.254", "[::1]", "::1", "printer.local",
    ]) {
      expect(isBlockedHost(h), h).toBe(true);
    }
  });

  it("blocks IPv6 link-local, unspecified, and IPv4-mapped internal IPs (review)", () => {
    for (const h of [
      "fe80::1", "[fe80::1]",            // IPv6 link-local
      "::",                                // IPv6 unspecified
      "::ffff:127.0.0.1",                 // IPv4-mapped loopback
      "::ffff:169.254.169.254",           // IPv4-mapped cloud metadata
      "::ffff:10.0.0.1",                  // IPv4-mapped RFC-1918
    ]) {
      expect(isBlockedHost(h), h).toBe(true);
    }
  });

  it("allows public hosts and edge-of-range IPs", () => {
    for (const h of [
      "example.com", "competitor.io", "8.8.8.8", "172.15.0.1", "172.32.0.1",
      "11.0.0.1", "192.169.0.1", "2606:4700:4700::1111", // public IPv6 (Cloudflare)
    ]) {
      expect(isBlockedHost(h), h).toBe(false);
    }
  });
});
