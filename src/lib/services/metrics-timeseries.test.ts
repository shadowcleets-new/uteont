import { describe, it, expect } from "vitest";
import { metricDayKey, toDayString } from "./metrics-timeseries";

describe("metrics-timeseries pure helpers (IP-10)", () => {
  it("toDayString renders a UTC YYYY-MM-DD", () => {
    expect(toDayString(new Date("2026-06-14T23:59:00Z"))).toBe("2026-06-14");
    expect(toDayString(new Date("2026-01-02T00:00:00Z"))).toBe("2026-01-02");
  });

  it("metricDayKey is stable + identical for the same (site, entity, metric, day)", () => {
    const a = metricDayKey({ siteId: 1, entityType: "page", entityKey: "/a", metric: "clicks", capturedOn: "2026-06-14" });
    const b = metricDayKey({ siteId: 1, entityType: "page", entityKey: "/a", metric: "clicks", capturedOn: "2026-06-14" });
    expect(a).toBe(b);
  });

  it("metricDayKey differs when any component differs (idempotency boundary)", () => {
    const base = { siteId: 1, entityType: "page" as const, entityKey: "/a", metric: "clicks", capturedOn: "2026-06-14" };
    const k = metricDayKey(base);
    expect(metricDayKey({ ...base, siteId: 2 })).not.toBe(k);
    expect(metricDayKey({ ...base, entityKey: "/b" })).not.toBe(k);
    expect(metricDayKey({ ...base, metric: "impressions" })).not.toBe(k);
    expect(metricDayKey({ ...base, capturedOn: "2026-06-15" })).not.toBe(k);
    expect(metricDayKey({ ...base, entityType: "query" })).not.toBe(k);
  });
});
