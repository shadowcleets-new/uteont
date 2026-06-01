import { describe, it, expect } from "vitest";
import { siteUpdateSchema } from "./site";

describe("siteUpdateSchema", () => {
  it("treats an empty sitemapUrl as 'not provided' (the edit form sends '')", () => {
    const r = siteUpdateSchema.safeParse({ name: "Prolve", sitemapUrl: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sitemapUrl).toBeUndefined();
  });

  it("accepts blank GSC id + a numeric GA4 id together", () => {
    const r = siteUpdateSchema.safeParse({ gscPropertyId: "", ga4PropertyId: "539767853" });
    expect(r.success).toBe(true);
  });

  it("still rejects a genuinely malformed sitemapUrl", () => {
    expect(siteUpdateSchema.safeParse({ sitemapUrl: "not-a-url" }).success).toBe(false);
  });

  it("accepts a valid sitemapUrl", () => {
    const r = siteUpdateSchema.safeParse({ sitemapUrl: "https://prolve.vercel.app/sitemap.xml" });
    expect(r.success).toBe(true);
  });
});
