import { describe, it, expect } from "vitest";
import { decidePublishAction, type PublishReceipt } from "./publish-decision";

describe("decidePublishAction (IP-07 idempotent publish)", () => {
  it("1. null receipt -> 'create'", () => {
    expect(decidePublishAction(null, "hash-a", 1)).toBe("create");
  });

  it("2. live receipt with identical contentHash, same revision -> 'noop'", () => {
    const receipt: PublishReceipt = {
      articleId: 1,
      revision: 3,
      contentHash: "hash-a",
      remoteId: "remote-1",
    };
    expect(decidePublishAction(receipt, "hash-a", 3)).toBe("noop");
  });

  it("3. live receipt with different contentHash, higher revision -> 'update'", () => {
    const receipt: PublishReceipt = {
      articleId: 1,
      revision: 3,
      contentHash: "hash-a",
      remoteId: "remote-1",
    };
    expect(decidePublishAction(receipt, "hash-b", 4)).toBe("update");
  });

  it("4. receipt exists but remoteId is null -> 'create'", () => {
    const receipt: PublishReceipt = {
      articleId: 1,
      revision: 3,
      contentHash: "hash-a",
      remoteId: null,
    };
    expect(decidePublishAction(receipt, "hash-a", 3)).toBe("create");
  });

  it("5. stale lower revision with different hash -> 'noop' (no regression)", () => {
    const receipt: PublishReceipt = {
      articleId: 1,
      revision: 5,
      contentHash: "hash-a",
      remoteId: "remote-1",
    };
    expect(decidePublishAction(receipt, "hash-b", 4)).toBe("noop");
  });

  it("undefined receipt -> 'create'", () => {
    expect(decidePublishAction(undefined, "hash-a", 1)).toBe("create");
  });

  it("same revision but different hash on a live receipt -> 'update'", () => {
    const receipt: PublishReceipt = {
      articleId: 2,
      revision: 4,
      contentHash: "hash-a",
      remoteId: "remote-2",
    };
    expect(decidePublishAction(receipt, "hash-b", 4)).toBe("update");
  });

  it("higher revision but identical hash on a live receipt -> 'update'", () => {
    const receipt: PublishReceipt = {
      articleId: 2,
      revision: 4,
      contentHash: "hash-a",
      remoteId: "remote-2",
    };
    expect(decidePublishAction(receipt, "hash-a", 5)).toBe("update");
  });
});
