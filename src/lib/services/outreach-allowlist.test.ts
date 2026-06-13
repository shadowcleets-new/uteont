import { describe, it, expect } from "vitest";
import { extractDomain, isOutreachTargetAllowed } from "./outreach-allowlist";

describe("extractDomain", () => {
  it("pulls the host from a URL", () => {
    expect(extractDomain("https://www.example.com/page")).toBe("example.com");
  });
  it("accepts a bare domain", () => {
    expect(extractDomain("Example.COM")).toBe("example.com");
  });
  it("strips a leading www.", () => {
    expect(extractDomain("www.foo.co.uk")).toBe("foo.co.uk");
  });
  it("returns null for junk", () => {
    expect(extractDomain("")).toBeNull();
    expect(extractDomain("not a domain at all")).toBeNull();
  });
});

describe("isOutreachTargetAllowed (LO-58)", () => {
  it("allows everything when the allowlist is empty (operator hasn't opted in)", () => {
    expect(isOutreachTargetAllowed("anyone.com", [])).toBe(true);
  });
  it("allows an exact domain match", () => {
    expect(isOutreachTargetAllowed("https://blog.example.com", ["example.com"])).toBe(true);
  });
  it("allows a subdomain of an allowlisted domain", () => {
    expect(isOutreachTargetAllowed("news.example.com", ["example.com"])).toBe(true);
  });
  it("blocks a target not on a non-empty allowlist", () => {
    expect(isOutreachTargetAllowed("evil.com", ["example.com", "partner.org"])).toBe(false);
  });
  it("blocks an unparseable target when an allowlist is set", () => {
    expect(isOutreachTargetAllowed("???", ["example.com"])).toBe(false);
  });
  it("does NOT let a bare-TLD entry match every domain under it (review)", () => {
    // "com" can't be parsed to a registrable host; it must not fall back to a raw
    // ".com" suffix match that would allow every .com target.
    expect(isOutreachTargetAllowed("evil.com", ["com"])).toBe(false);
    expect(isOutreachTargetAllowed("evil.com", ["example.com"])).toBe(false);
  });
});
