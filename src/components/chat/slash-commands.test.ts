import { describe, it, expect } from "vitest";
import { matchedCommands, SLASH_COMMANDS } from "./ChatInput";

describe("matchedCommands", () => {
  it("returns no suggestions when input is empty", () => {
    expect(matchedCommands("")).toEqual([]);
  });

  it("returns no suggestions when input doesn't start with /", () => {
    expect(matchedCommands("hello world")).toEqual([]);
    expect(matchedCommands(" foo")).toEqual([]);
  });

  it("returns all commands when input is just /", () => {
    expect(matchedCommands("/")).toEqual(SLASH_COMMANDS);
  });

  it("filters by prefix case-insensitively", () => {
    expect(matchedCommands("/re").map((c) => c.command)).toEqual(["/research"]);
    expect(matchedCommands("/AU").map((c) => c.command)).toEqual(["/audit"]);
    expect(matchedCommands("/STATUS").map((c) => c.command)).toEqual(["/status"]);
  });

  it("returns empty when no command matches the prefix", () => {
    expect(matchedCommands("/zzz")).toEqual([]);
  });

  it("hides suggestions once the user types past the command (whitespace)", () => {
    expect(matchedCommands("/research ")).toEqual([]);
    expect(matchedCommands("/research sourdough")).toEqual([]);
  });

  it("tolerates a leading whitespace before the slash", () => {
    expect(matchedCommands("  /res").map((c) => c.command)).toEqual([
      "/research",
    ]);
  });
});
