import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./director";
import type { Site } from "@/lib/db/schema";

const fakeSite: Site = {
  id: 1,
  key: "tonyspizza",
  name: "Tony's Pizza",
  domain: "https://tonyspizza.com",
  locale: "en-US",
  niche: "NYC pizza & Italian-American food",
  audience: "home cooks + NYC tourists",
  voiceGuide: "Warm, slightly nostalgic, food-first; never corporate",
  contentPillars: ["recipes", "neighborhood history", "gear reviews"],
  bannedPhrases: ["delicious", "mouth-watering"],
  defaultCategories: ["Recipes", "Reviews"],
  cmsPlatform: "wordpress",
  sitemapUrl: null,
  gscPropertyId: null,
  ga4PropertyId: null,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("buildSystemPrompt", () => {
  it("includes the SITE CONTEXT block when site is provided", () => {
    const p = buildSystemPrompt(fakeSite);
    expect(p).toMatch(/SITE CONTEXT/);
    expect(p).toMatch(/Tony's Pizza/);
    expect(p).toMatch(/NYC pizza/);
    expect(p).toMatch(/Warm, slightly nostalgic/);
    expect(p).toMatch(/delicious/);
    expect(p).toMatch(/recipes.*neighborhood history.*gear reviews/);
  });

  it("includes the 'no site selected' instruction when site is null", () => {
    const p = buildSystemPrompt(null);
    expect(p).not.toMatch(/SITE CONTEXT/);
    expect(p).toMatch(/No site selected/);
    expect(p).toMatch(/ask which site/i);
  });

  it("retains the base director role + tools regardless of site", () => {
    const withSite = buildSystemPrompt(fakeSite);
    const without = buildSystemPrompt(null);
    expect(withSite).toMatch(/UTEONT's Director Agent/);
    expect(without).toMatch(/UTEONT's Director Agent/);
    expect(withSite).toMatch(/research\(seeds/);
    expect(without).toMatch(/research\(seeds/);
  });
});
