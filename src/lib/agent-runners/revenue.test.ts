import { describe, it, expect } from "vitest";
import { analyzeRevenue } from "./revenue";

const U = "https://shop.com";

const STRONG = `<!doctype html><html><body>
<header><a href="/pricing">Pricing</a> <a href="/contact">Contact</a></header>
<h1>Best widgets</h1>
<a class="btn" href="/checkout">Buy now</a>
<p>Trusted by 5000 customers. 5-star reviews. 30-day money-back guarantee.</p>
<button>Start free trial</button>
<form><input type="email" name="email"><button>Subscribe</button></form>
<a href="https://partner.com/ref">Our partner</a>
<a href="/get-started">Get started</a>
</body></html>`;

const WEAK = `<html><body><h1>About us</h1><p>We are a company. Here is some text about us.</p>
<a href="/about">More about us</a></body></html>`;

describe("analyzeRevenue", () => {
  it("scores a conversion-optimized page highly", () => {
    const r = analyzeRevenue({ url: U, html: STRONG, pageOk: true });
    expect(r.counts.ctas).toBeGreaterThanOrEqual(3);
    expect(r.counts.moneyLinks).toBeGreaterThanOrEqual(2);
    expect(r.counts.forms).toBe(1);
    expect(r.counts.externalLinks).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it("flags a page with no CTA or money path", () => {
    const r = analyzeRevenue({ url: U, html: WEAK, pageOk: true });
    expect(r.counts.ctas).toBe(0);
    expect(r.score).toBeLessThan(40);
    const ids = r.issues.map((i) => i.id);
    expect(ids).toContain("has_cta");
    expect(ids).toContain("money_page_link");
    expect(r.issues[0].severity).toBe("high");
  });

  it("returns score 0 when nothing could be fetched", () => {
    const r = analyzeRevenue({ url: U, html: "", pageOk: false });
    expect(r.score).toBe(0);
  });
});
