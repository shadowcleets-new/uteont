import { describe, it, expect } from "vitest";
import {
  computeContentHash,
  decidePublishAction,
  type PublishReceipt,
} from "./publishing";

// Build a receipt with sensible defaults; override per case.
const receipt = (over: Partial<PublishReceipt> = {}): PublishReceipt => ({
  articleId: over.articleId ?? 1,
  revision: over.revision ?? 1,
  targetId: over.targetId ?? "cms-a",
  contentHash: over.contentHash ?? computeContentHash("hello world"),
  remoteId: over.remoteId ?? "remote-123",
});

describe("computeContentHash", () => {
  it("is deterministic for the same content", () => {
    expect(computeContentHash("hello world")).toBe(computeContentHash("hello world"));
  });

  it("returns a 64-char lowercase sha256 hex string", () => {
    const h = computeContentHash("hello world");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different content", () => {
    expect(computeContentHash("hello world")).not.toBe(computeContentHash("hello world!"));
  });

  it("handles empty string deterministically", () => {
    expect(computeContentHash("")).toBe(computeContentHash(""));
    expect(computeContentHash("")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("decidePublishAction", () => {
  it("returns 'create' when there is no prior receipt", () => {
    const hash = computeContentHash("brand new article");
    expect(decidePublishAction(null, hash, 1)).toBe("create");
  });

  it("returns 'noop' when the stored hash matches the new hash", () => {
    const hash = computeContentHash("identical body");
    const r = receipt({ contentHash: hash, revision: 3 });
    expect(decidePublishAction(r, hash, 3)).toBe("noop");
  });

  it("returns 'noop' on identical content even when revision differs", () => {
    const hash = computeContentHash("same content");
    const r = receipt({ contentHash: hash, revision: 1 });
    // hash matches => already live with identical content, revision is irrelevant
    expect(decidePublishAction(r, hash, 9)).toBe("noop");
  });

  it("returns 'update' when content changed and revision is higher", () => {
    const r = receipt({ contentHash: computeContentHash("old body"), revision: 1 });
    const newHash = computeContentHash("new body");
    expect(decidePublishAction(r, newHash, 2)).toBe("update");
  });

  it("returns 'update' when content changed at the same revision", () => {
    const r = receipt({ contentHash: computeContentHash("old body"), revision: 5 });
    const newHash = computeContentHash("new body");
    expect(decidePublishAction(r, newHash, 5)).toBe("update");
  });
});
