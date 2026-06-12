import { describe, it, expect } from "vitest";
import { escapeMarkdown } from "./telegram";

describe("escapeMarkdown (A-13 fix)", () => {
  it("escapes the Telegram Markdown control chars that break parsing", () => {
    expect(escapeMarkdown("_*`[]")).toBe("\\_\\*\\`\\[\\]");
  });

  it("neutralizes a crafted callback payload so it can't break the code fence", () => {
    // An attacker-influenced callback `data` with backticks would otherwise
    // close the `\`${data}\`` fence and corrupt the reply (400 → silent drop).
    const data = "approve_top:keywords:1:`evil`";
    const escaped = escapeMarkdown(data);
    expect(escaped).not.toContain("`evil`");
    expect(escaped).toContain("\\`evil\\`");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeMarkdown("open:dashboard")).toBe("open:dashboard");
  });
});
