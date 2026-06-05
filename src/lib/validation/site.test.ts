import { describe, it, expect } from "vitest";
import {
  siteCreateSchema,
  siteUpdateSchema,
  integrationCreateSchema,
  integrationUpdateSchema,
  CMS_PLATFORMS,
  INTEGRATION_KINDS,
} from "./site";

describe("siteCreateSchema", () => {
  it("accepts a minimal valid payload and fills defaults", () => {
    const out = siteCreateSchema.parse({
      key: "tonyspizza",
      name: "Tony's",
      domain: "https://tonys.com",
    });
    expect(out.cmsPlatform).toBe("none");
    expect(out.locale).toBe("en-US");
    expect(out.contentPillars).toEqual([]);
    expect(out.bannedPhrases).toEqual([]);
    expect(out.defaultCategories).toEqual([]);
  });

  it("rejects upper-case or punctuation in key", () => {
    expect(siteCreateSchema.safeParse({
      key: "Tonys",
      name: "X",
      domain: "https://x.com",
    }).success).toBe(false);
    expect(siteCreateSchema.safeParse({
      key: "tonys pizza",
      name: "X",
      domain: "https://x.com",
    }).success).toBe(false);
    expect(siteCreateSchema.safeParse({
      key: "tonys_pizza",
      name: "X",
      domain: "https://x.com",
    }).success).toBe(false);
  });

  it("rejects non-URL domain", () => {
    expect(siteCreateSchema.safeParse({
      key: "x",
      name: "X",
      domain: "tonys.com",
    }).success).toBe(false);
  });

  it("rejects unknown cmsPlatform", () => {
    expect(siteCreateSchema.safeParse({
      key: "xyz",
      name: "X",
      domain: "https://x.com",
      cmsPlatform: "drupal",
    }).success).toBe(false);
  });

  it("includes every advertised CMS platform", () => {
    for (const p of CMS_PLATFORMS) {
      expect(siteCreateSchema.safeParse({
        key: "xyz",
        name: "X",
        domain: "https://x.com",
        cmsPlatform: p,
      }).success).toBe(true);
    }
  });
});

describe("siteUpdateSchema", () => {
  it("forbids key, domain, cmsPlatform mutation", () => {
    const r = siteUpdateSchema.safeParse({
      name: "OK",
      key: "newkey",
      domain: "https://other.com",
      cmsPlatform: "wordpress",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("key" in r.data).toBe(false);
      expect("domain" in r.data).toBe(false);
      expect("cmsPlatform" in r.data).toBe(false);
      expect(r.data.name).toBe("OK");
    }
  });
});

describe("integrationCreateSchema", () => {
  it("accepts a wordpress integration with config", () => {
    const out = integrationCreateSchema.parse({
      kind: "wordpress",
      label: "Main blog",
      config: { baseUrl: "https://wp.example", token: "xyz" },
    });
    expect(out.kind).toBe("wordpress");
    expect(out.config).toEqual({ baseUrl: "https://wp.example", token: "xyz" });
  });

  it("defaults config to empty object when omitted", () => {
    const out = integrationCreateSchema.parse({ kind: "slack" });
    expect(out.config).toEqual({});
  });

  it("rejects unknown kinds", () => {
    expect(integrationCreateSchema.safeParse({
      kind: "drupal",
      config: {},
    }).success).toBe(false);
  });

  it("includes every advertised integration kind", () => {
    for (const k of INTEGRATION_KINDS) {
      expect(integrationCreateSchema.safeParse({ kind: k }).success).toBe(true);
    }
  });
});

describe("integrationUpdateSchema", () => {
  it("forbids kind mutation", () => {
    const r = integrationUpdateSchema.safeParse({
      kind: "ga4",
      label: "Renamed",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("kind" in r.data).toBe(false);
      expect(r.data.label).toBe("Renamed");
    }
  });
});
