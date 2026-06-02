import { describe, it, expect } from "vitest";
import { relativeTime } from "./relative-time";

const NOW = Date.parse("2026-06-02T12:00:00.000Z");

describe("relativeTime", () => {
  it("renders sub-minute as 'just now'", () => {
    expect(relativeTime(NOW - 10_000, NOW)).toBe("just now");
  });

  it("renders minutes with correct pluralization", () => {
    expect(relativeTime(NOW - 60_000, NOW)).toBe("1 minute ago");
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5 minutes ago");
  });

  it("renders hours", () => {
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 hours ago");
  });

  it("renders days", () => {
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2 days ago");
  });

  it("accepts ISO strings and Date objects", () => {
    expect(relativeTime(new Date(NOW - 3_600_000), NOW)).toBe("1 hour ago");
    expect(relativeTime(new Date(NOW - 3_600_000).toISOString(), NOW)).toBe("1 hour ago");
  });

  it("handles future timestamps", () => {
    expect(relativeTime(NOW + 2 * 3_600_000, NOW)).toBe("in 2 hours");
  });

  it("returns an em dash for null/invalid input", () => {
    expect(relativeTime(null, NOW)).toBe("—");
    expect(relativeTime("not a date", NOW)).toBe("—");
  });
});
