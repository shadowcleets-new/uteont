import { describe, it, expect } from "vitest";
import { analyzeTechnicalSeo, type TechnicalSeoResult } from "./technical-seo";

const find = (r: TechnicalSeoResult, id: string) => r.checks.find((c) => c.id === id);

const GOOD_HTML = `<!DOCTYPE html><html lang="en"><head>
<title>Premium B2B Textile Manufacturing Services Worldwide</title>
<meta name="description" content="We are a premium B2B textile manufacturer delivering high-quality woven and knitted fabrics to global apparel brands with fast lead times.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="Textile Manufacturing">
<meta property="og:image" content="https://x.com/og.png">
<link rel="canonical" href="https://x.com/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
</head><body>
<h1>Textile Manufacturing</h1>
<img src="a.jpg" alt="woven fabric sample"/>
</body></html>`;

const GOOD_ROBOTS = "User-agent: *\nAllow: /\nSitemap: https://x.com/sitemap.xml\n";
const GOOD_SITEMAP = `<?xml version="1.0"?><urlset><url><loc>https://x.com/</loc></url></urlset>`;

describe("analyzeTechnicalSeo", () => {
  it("scores a well-formed page highly with the key checks passing", () => {
    const r = analyzeTechnicalSeo({
      url: "https://x.com",
      html: GOOD_HTML,
      robotsTxt: GOOD_ROBOTS,
      sitemapXml: GOOD_SITEMAP,
      homepageOk: true,
    });
    expect(r.score).toBeGreaterThanOrEqual(85);
    for (const id of ["https", "title", "meta_desc", "viewport", "lang", "single_h1", "canonical", "jsonld", "robots", "sitemap"]) {
      expect(find(r, id)?.passed, `${id} should pass`).toBe(true);
    }
    expect(r.fetched).toEqual({ homepage: true, robotsTxt: true, sitemapXml: true });
  });

  it("flags a bare page with a low score and prioritized issues", () => {
    const r = analyzeTechnicalSeo({
      url: "http://x.com", // not https
      html: "<html><body><p>hello</p><img src='a.jpg'></body></html>",
      robotsTxt: "",
      sitemapXml: "",
      homepageOk: true,
    });
    expect(r.score).toBeLessThan(40);
    expect(find(r, "https")?.passed).toBe(false);
    expect(find(r, "title")?.passed).toBe(false);
    expect(find(r, "meta_desc")?.passed).toBe(false);
    expect(find(r, "img_alt")?.passed).toBe(false);
    // issues are sorted high severity first
    expect(r.issues[0].severity).toBe("high");
  });

  it("scores 0 when the homepage could not be fetched", () => {
    const r = analyzeTechnicalSeo({
      url: "https://x.com", html: "", robotsTxt: "", sitemapXml: "", homepageOk: false,
    });
    expect(r.score).toBe(0);
    expect(r.fetched.homepage).toBe(false);
  });

  it("counts multiple h1s as a failure", () => {
    const r = analyzeTechnicalSeo({
      url: "https://x.com",
      html: "<html><body><h1>One</h1><h1>Two</h1></body></html>",
      robotsTxt: "", sitemapXml: "", homepageOk: true,
    });
    expect(find(r, "single_h1")?.passed).toBe(false);
    expect(find(r, "single_h1")?.detail).toContain("2");
  });
});
