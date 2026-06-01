import { describe, it, expect } from "vitest";
import { ga4ReportBody, summarizeGa4, GA4_METRICS } from "./ga4";
import { isSlackWebhook, slackPayload, sendSlackWebhook } from "./slack";

describe("ga4ReportBody", () => {
  it("requests the metric set over the range", () => {
    const body = ga4ReportBody({ startDate: "2026-01-01", endDate: "2026-01-28" }) as {
      dateRanges: Array<{ startDate: string; endDate: string }>;
      metrics: Array<{ name: string }>;
    };
    expect(body.dateRanges[0]).toEqual({ startDate: "2026-01-01", endDate: "2026-01-28" });
    expect(body.metrics.map((m) => m.name)).toEqual([...GA4_METRICS]);
  });
});

describe("summarizeGa4", () => {
  it("parses metric values positionally and rounds", () => {
    const s = summarizeGa4({ rows: [{ metricValues: [{ value: "1234.6" }, { value: "987" }, { value: "42" }, { value: "0.63217" }] }] });
    expect(s).toEqual({ sessions: 1235, totalUsers: 987, conversions: 42, engagementRate: 0.6322 });
  });
  it("returns zeros for an empty report", () => {
    expect(summarizeGa4({})).toEqual({ sessions: 0, totalUsers: 0, conversions: 0, engagementRate: 0 });
  });
});

describe("slack", () => {
  it("only accepts real Slack webhook URLs", () => {
    expect(isSlackWebhook("https://hooks.slack.com/services/T/B/x")).toBe(true);
    expect(isSlackWebhook("https://evil.com/hook")).toBe(false);
  });
  it("builds a text payload", () => {
    expect(slackPayload("hi")).toEqual({ text: "hi" });
  });
  it("refuses to POST to a non-Slack URL (no network)", async () => {
    expect(await sendSlackWebhook("https://evil.com/hook", "hi")).toBe(false);
  });
});
