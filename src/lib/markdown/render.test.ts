import { describe, it, expect } from "vitest";
import { tokenize } from "./render";

describe("tokenize", () => {
  it("returns an empty array on empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   \n  \n")).toEqual([]);
  });

  it("recognizes headings 1-6", () => {
    const toks = tokenize("# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6");
    expect(toks).toHaveLength(6);
    expect(toks[0]).toEqual({ kind: "heading", level: 1, text: "H1" });
    expect(toks[5]).toEqual({ kind: "heading", level: 6, text: "H6" });
  });

  it("collapses consecutive bulleted lines into one ul token", () => {
    const toks = tokenize("- one\n- two\n- three");
    expect(toks).toHaveLength(1);
    expect(toks[0]).toEqual({ kind: "ul", items: ["one", "two", "three"] });
  });

  it("collapses consecutive numbered lines into one ol token", () => {
    const toks = tokenize("1. one\n2. two\n3. three");
    expect(toks).toEqual([{ kind: "ol", items: ["one", "two", "three"] }]);
  });

  it("parses fenced code blocks and captures the language", () => {
    const toks = tokenize("```js\nconst a = 1;\nconst b = 2;\n```");
    expect(toks).toEqual([
      { kind: "code", lang: "js", text: "const a = 1;\nconst b = 2;" },
    ]);
  });

  it("captures unlabelled fenced code with lang null", () => {
    const toks = tokenize("```\nplain\n```");
    expect(toks).toEqual([{ kind: "code", lang: null, text: "plain" }]);
  });

  it("collapses blockquote lines into a single token", () => {
    const toks = tokenize("> first\n> second");
    expect(toks).toEqual([{ kind: "quote", lines: ["first", "second"] }]);
  });

  it("joins wrapped paragraph lines with a space", () => {
    const toks = tokenize("This is one\nparagraph.");
    expect(toks).toEqual([{ kind: "p", text: "This is one paragraph." }]);
  });

  it("separates paragraphs by blank lines", () => {
    const toks = tokenize("first\n\nsecond");
    expect(toks).toEqual([
      { kind: "p", text: "first" },
      { kind: "p", text: "second" },
    ]);
  });

  it("mixes block kinds in document order", () => {
    const src = `# Title

Intro paragraph.

- bullet 1
- bullet 2

\`\`\`ts
const x = 1;
\`\`\`

> wisdom

Closing.`;
    const toks = tokenize(src);
    expect(toks.map((t) => t.kind)).toEqual([
      "heading",
      "p",
      "ul",
      "code",
      "quote",
      "p",
    ]);
  });
});
