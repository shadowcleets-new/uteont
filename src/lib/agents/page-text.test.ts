import { describe, it, expect } from "vitest";
import { htmlToText } from "./page-text";

describe("htmlToText (LO-04 live-page extraction)", () => {
  it("strips tags and collapses whitespace", () => {
    const html = "<h1>Title</h1>\n<p>Hello   <b>world</b>.</p>";
    expect(htmlToText(html)).toBe("Title Hello world.");
  });

  it("drops script and style content entirely", () => {
    const html = "<style>.a{color:red}</style><p>Keep</p><script>evil()</script>";
    expect(htmlToText(html)).toBe("Keep");
  });

  it("decodes common HTML entities", () => {
    expect(htmlToText("<p>Tom &amp; Jerry &lt;3</p>")).toBe("Tom & Jerry <3");
  });

  it("returns empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
  });
});
