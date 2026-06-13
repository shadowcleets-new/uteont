import { describe, it, expect } from "vitest";
import { resolveRedirectUrl } from "./safe-fetch";

describe("resolveRedirectUrl (SSRF redirect-hop guard)", () => {
  it("resolves an absolute Location verbatim", () => {
    expect(resolveRedirectUrl("https://evil.example/x", "https://good.example/")).toBe(
      "https://evil.example/x",
    );
  });

  it("resolves a relative Location against the current URL", () => {
    expect(resolveRedirectUrl("/internal", "https://good.example/page")).toBe(
      "https://good.example/internal",
    );
  });

  it("catches a redirect to the cloud-metadata IP (the SSRF target)", () => {
    expect(resolveRedirectUrl("http://169.254.169.254/latest/meta-data/", "https://good.example/")).toBe(
      "http://169.254.169.254/latest/meta-data/",
    );
  });

  it("returns null for a non-http(s) scheme like file://", () => {
    expect(resolveRedirectUrl("file:///etc/passwd", "https://good.example/")).toBeNull();
  });

  it("returns null for a malformed Location", () => {
    expect(resolveRedirectUrl("http://[::bad", "https://good.example/")).toBeNull();
  });
});
