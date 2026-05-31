import { describe, it, expect } from "vitest";
import { analyzeContentAudit } from "./content-audit";

const sentence = "This guide explains the topic in clear simple terms. ";

// A well-structured page: long readable prose, one h1, two h2 sections, a list,
// 3 internal links, 1 external link, an image.
const RICH = `<!doctype html><html lang="en"><head><title>Guide</title></head><body>
<h1>The Complete Guide</h1>
<p>${sentence.repeat(40)}</p>
<h2>First Section</h2>
<p>${sentence.repeat(40)}</p>
<ul><li>Point A</li><li>Point B</li><li>Point C</li></ul>
<h2>Second Section</h2>
<p>${sentence.repeat(40)}</p>
<p>See <a href="/pricing">pricing</a>, <a href="/blog">blog</a>, and
<a href="https://ex.com/docs">docs</a>, plus <a href="https://external.com/ref">a source</a>.</p>
<img src="a.png" alt="diagram">
</body></html>`;

const THIN = `<html><body><h1>Hi</h1><p>Too short.</p></body></html>`;

describe("analyzeContentAudit", () => {
  it("scores a rich, well-structured page highly", () => {
    const r = analyzeContentAudit({ url: "https://ex.com", html: RICH, pageOk: true });
    expect(r.wordCount).toBeGreaterThan(600);
    expect(r.counts.h1).toBe(1);
    expect(r.counts.h2).toBe(2);
    expect(r.counts.internalLinks).toBe(3); // /pricing, /blog, ex.com/docs (same host)
    expect(r.counts.externalLinks).toBe(1); // external.com
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.readability).toBe("Easy");
  });

  it("flags a thin page with the high-severity issues first", () => {
    const r = analyzeContentAudit({ url: "https://ex.com", html: THIN, pageOk: true });
    expect(r.score).toBeLessThan(50);
    const ids = r.issues.map((i) => i.id);
    expect(ids).toContain("content_depth");
    expect(ids).toContain("internal_links");
    // highest-severity issue sorts first
    expect(r.issues[0].severity).toBe("high");
  });

  it("returns score 0 when the page could not be fetched", () => {
    const r = analyzeContentAudit({ url: "https://ex.com", html: "", pageOk: false });
    expect(r.score).toBe(0);
    expect(r.fetched.page).toBe(false);
  });

  it("does not count anchors, mailto or external links as internal", () => {
    const html = `<a href="#top">top</a><a href="mailto:x@y.com">mail</a>` +
      `<a href="https://other.com/a">ext</a><a href="/local">local</a>`;
    const r = analyzeContentAudit({ url: "https://ex.com", html, pageOk: true });
    expect(r.counts.internalLinks).toBe(1); // only /local
    expect(r.counts.externalLinks).toBe(1); // only other.com
  });
});
