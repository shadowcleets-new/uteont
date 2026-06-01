import { describe, it, expect, afterEach } from "vitest";
import {
  gscDateRange, buildSearchAnalyticsBody, summarizeSearchAnalytics, buildConsentUrl, candidatePropertyUrls,
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
