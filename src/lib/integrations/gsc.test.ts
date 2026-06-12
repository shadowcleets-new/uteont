import { describe, it, expect, afterEach } from "vitest";
import {
  gscDateRange, buildSearchAnalyticsBody, summarizeSearchAnalytics, buildConsentUrl, candidatePropertyUrls,
  buildSearchAnalyticsBodyByDate, buildSearchAnalyticsBodyByQuery, parseDailyRows, parseQueryRows,
  buildSearchAnalyticsBodyByPage, parsePageRows,
} from "./gsc";

const DAY = 86_400_000;

describe("gscDateRange", () => {
  it("ends ~3 days back and spans the requested window, formatted YYYY-MM-DD", () => {
    const now = Date.UTC(2026, 0, 31); // 2026-01-31
    const r = gscDateRange(now, 28);
    expect(r.endDate).toBe("2026-01-28"); // now - 3 days
    expect(r.startDate).toBe("2025-12-31"); // end - 28 days
    expect(/^\d{4}-\d{2}-\d{2}$/.test(r.startDate)).toBe(true);
  });

  it("respects a custom span", () => {
    const now = Date.UTC(2026, 0, 31);
    const r = gscDateRange(now, 7);
    expect(new Date(r.endDate + "T00:00:00Z").getTime() - new Date(r.startDate + "T00:00:00Z").getTime()).toBe(7 * DAY);
  });
});

describe("buildSearchAnalyticsBody", () => {
  it("requests a single aggregate row over the range", () => {
    const body = buildSearchAnalyticsBody({ startDate: "2026-01-01", endDate: "2026-01-28" });
    expect(body).toMatchObject({ startDate: "2026-01-01", endDate: "2026-01-28", dimensions: [], rowLimit: 1 });
  });
});

describe("summarizeSearchAnalytics", () => {
  it("reads the aggregate row and rounds sensibly", () => {
    const s = summarizeSearchAnalytics({ rows: [{ clicks: 123.6, impressions: 4567.2, ctr: 0.027123, position: 12.34 }] });
    expect(s).toEqual({ clicks: 124, impressions: 4567, ctr: 0.0271, position: 12.3 });
  });

  it("returns zeros when there are no rows", () => {
    expect(summarizeSearchAnalytics({})).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
    expect(summarizeSearchAnalytics({ rows: [] })).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });
});

describe("candidatePropertyUrls", () => {
  it("offers URL-prefix (trailing-slash first) + domain variants for an https URL", () => {
    const c = candidatePropertyUrls("https://prolve.com");
    expect(c[0]).toBe("https://prolve.com/"); // GSC URL-prefix props carry a trailing slash
    expect(c).toContain("https://prolve.com");
    expect(c).toContain("sc-domain:prolve.com");
  });

  it("expands a bare domain", () => {
    const c = candidatePropertyUrls("prolve.com");
    expect(c).toContain("https://prolve.com/");
    expect(c).toContain("sc-domain:prolve.com");
  });

  it("passes an sc-domain through unchanged", () => {
    expect(candidatePropertyUrls("sc-domain:prolve.com")).toEqual(["sc-domain:prolve.com"]);
  });

  it("returns nothing for an empty property", () => {
    expect(candidatePropertyUrls("")).toEqual([]);
  });
});

describe("buildConsentUrl", () => {
  const prev = process.env.GOOGLE_OAUTH_CLIENT_ID;
  afterEach(() => {
    if (prev === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = prev;
  });

  it("returns null when no client id is configured", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(buildConsentUrl("https://app/cb", "state123")).toBeNull();
  });

  it("includes offline access, forced consent, scope and state when configured", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "client-xyz";
    const url = buildConsentUrl("https://app/cb", "state123");
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toContain("webmasters.readonly");
    expect(url).toContain("state=state123");
    expect(url).toContain("client_id=client-xyz");
  });
});

describe("buildSearchAnalyticsBodyByDate", () => {
  it("requests one row per day over the range", () => {
    const body = buildSearchAnalyticsBodyByDate({ startDate: "2026-01-01", endDate: "2026-01-28" });
    expect(body).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-01-28",
      dimensions: ["date"],
    });
    expect(Number(body.rowLimit)).toBeGreaterThanOrEqual(90);
  });
});

describe("buildSearchAnalyticsBodyByQuery", () => {
  it("requests per-query rows capped at the limit", () => {
    const body = buildSearchAnalyticsBodyByQuery({ startDate: "2026-01-01", endDate: "2026-01-28" }, 50);
    expect(body).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-01-28",
      dimensions: ["query"],
      rowLimit: 50,
    });
  });
});

describe("buildSearchAnalyticsBodyByPage (LO-29c)", () => {
  it("requests per-page rows capped at the limit", () => {
    const body = buildSearchAnalyticsBodyByPage({ startDate: "2026-01-01", endDate: "2026-01-28" }, 25);
    expect(body).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-01-28",
      dimensions: ["page"],
      rowLimit: 25,
    });
  });
});

describe("parsePageRows (LO-29c)", () => {
  it("maps keyed rows to page rows, preserving API order", () => {
    const rows = parsePageRows({
      rows: [
        { keys: ["https://site.test/a"], clicks: 20, impressions: 1000, ctr: 0.02, position: 3.1 },
        { keys: ["https://site.test/b"], clicks: 5, impressions: 300, ctr: 0.016, position: 9.8 },
      ],
    });
    expect(rows).toEqual([
      { page: "https://site.test/a", clicks: 20, impressions: 1000, ctr: 0.02, position: 3.1 },
      { page: "https://site.test/b", clicks: 5, impressions: 300, ctr: 0.016, position: 9.8 },
    ]);
  });

  it("returns [] for empty/malformed payloads", () => {
    expect(parsePageRows({})).toEqual([]);
    expect(parsePageRows(null)).toEqual([]);
  });
});

describe("parseDailyRows", () => {
  it("maps keyed rows to chronological day points", () => {
    const rows = parseDailyRows({
      rows: [
        { keys: ["2026-01-02"], clicks: 5.4, impressions: 100.2, ctr: 0.05, position: 8.21 },
        { keys: ["2026-01-01"], clicks: 2, impressions: 50, ctr: 0.04, position: 11.5 },
      ],
    });
    expect(rows.map((r) => r.day)).toEqual(["2026-01-01", "2026-01-02"]);
    expect(rows[1]).toEqual({ day: "2026-01-02", clicks: 5, impressions: 100, ctr: 0.05, position: 8.2 });
  });

  it("returns [] for empty/malformed payloads", () => {
    expect(parseDailyRows({})).toEqual([]);
    expect(parseDailyRows({ rows: [] })).toEqual([]);
    expect(parseDailyRows(null)).toEqual([]);
  });
});

describe("parseQueryRows", () => {
  it("maps keyed rows to query rows, preserving API order", () => {
    const rows = parseQueryRows({
      rows: [
        { keys: ["best widgets"], clicks: 12, impressions: 900, ctr: 0.013, position: 4.4 },
        { keys: ["widget reviews"], clicks: 3, impressions: 200, ctr: 0.015, position: 14.9 },
      ],
    });
    expect(rows).toEqual([
      { query: "best widgets", clicks: 12, impressions: 900, ctr: 0.013, position: 4.4 },
      { query: "widget reviews", clicks: 3, impressions: 200, ctr: 0.015, position: 14.9 },
    ]);
  });

  it("returns [] for empty/malformed payloads", () => {
    expect(parseQueryRows({})).toEqual([]);
    expect(parseQueryRows(undefined)).toEqual([]);
  });
});
