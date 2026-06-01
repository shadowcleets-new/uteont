import { describe, it, expect } from "vitest";
import { semanticProfile, coverageAnalysis } from "./content-brief";

const page = (title: string, bodyWords: string, headings: string[] = [], entities = "") => `
<html><body>
<h1>${title}</h1>
${headings.map((h) => `<h2>${h}</h2>`).join("\n")}
<p>${entities} ${bodyWords}</p>
</body></html>`;

describe("semanticProfile", () => {
  it("extracts wordcount, outline, terms and entities", () => {
    const html = page(
      "Widget Guide",
      "widgets widgets widgets manufacturing process quality control export logistics " + "filler ".repeat(40),
      ["Manufacturing Process", "Quality Control"],
      "Acme Corporation operates in North America.",
    );
    const p = semanticProfile(html, "https://x.com");
    expect(p.wordCount).toBeGreaterThan(40);
    expect(p.outline).toEqual(["Manufacturing Process", "Quality Control"]);
    expect(p.terms.find((t) => t.term === "widgets")?.count).toBeGreaterThanOrEqual(3);
    // stopwords excluded
    expect(p.terms.find((t) => t.term === "the")).toBeUndefined();
    // multi-word entity captured
    expect(p.entities).toContain("Acme Corporation");
  });
});

describe("coverageAnalysis", () => {
  it("baseline mode: thin page scores low, rich page scores higher", () => {
    const thin = semanticProfile(page("Hi", "short text here"), "https://x.com");
    const rich = semanticProfile(
      page("Deep Guide", "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon ".repeat(50), ["A", "B", "C"], "Big Corp Northwind Traders"),
      "https://x.com",
    );
    const thinR = coverageAnalysis(thin, []);
    const richR = coverageAnalysis(rich, []);
    expect(thinR.mode).toBe("baseline");
    expect(richR.score).toBeGreaterThan(thinR.score);
    expect(thinR.issues.map((i) => i.id)).toContain("depth");
  });

  it("competitive mode: finds missing terms + topics vs the corpus", () => {
    const target = semanticProfile(page("Mine", "shirts cotton fabric " + "filler ".repeat(30), ["Cotton"]), "https://mine.com");
    const c1 = semanticProfile(page("C1", "shirts cotton fabric polyester sustainability dyeing " + "filler ".repeat(60), ["Cotton", "Sustainability", "Dyeing"]), "https://c1.com");
    const c2 = semanticProfile(page("C2", "shirts cotton polyester sustainability dyeing logistics " + "filler ".repeat(60), ["Sustainability", "Dyeing", "Logistics"]), "https://c2.com");
    const r = coverageAnalysis(target, [c1, c2]);
    expect(r.mode).toBe("competitive");
    expect(r.competitorsAnalyzed).toBe(2);
    expect(r.medianCompetitorWords).toBeGreaterThan(target.wordCount);
    // polyester/sustainability/dyeing appear in both competitors but not the target
    expect(r.missingTerms).toContain("polyester");
    expect(r.missingTerms).toContain("sustainability");
    // a competitor topic the target lacks
    expect(r.missingTopics.join(" ").toLowerCase()).toContain("dyeing");
    expect(r.recommendedWordCount).toBeGreaterThanOrEqual(800);
  });

  it("scores 0 when the target could not be fetched", () => {
    const empty = semanticProfile("", "https://x.com");
    expect(coverageAnalysis(empty, [], false).score).toBe(0);
  });
});
