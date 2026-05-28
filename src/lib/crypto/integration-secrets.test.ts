import { describe, it, expect, beforeEach } from "vitest";

describe("integration-secrets", () => {
  beforeEach(() => {
    process.env.CONNECTION_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("round-trips an object through encrypt → decrypt", async () => {
    const { encrypt, decrypt } = await import("./integration-secrets");
    const plaintext = { baseUrl: "https://x.com", token: "abc123" };
    const { ciphertext, iv, tag } = encrypt(plaintext);
    expect(ciphertext).not.toContain("abc123");
    expect(decrypt(ciphertext, iv, tag)).toEqual(plaintext);
  });

  it("rejects tampered ciphertext (GCM auth tag fails)", async () => {
    const { encrypt, decrypt } = await import("./integration-secrets");
    const { ciphertext, iv, tag } = encrypt({ foo: "bar" });
    const tampered =
      Buffer.from(ciphertext, "base64").map((b, i) => (i === 0 ? b ^ 1 : b))
        .toString("base64");
    expect(() => decrypt(tampered, iv, tag)).toThrow();
  });

  it("rejects with a different key", async () => {
    const { encrypt, decrypt } = await import("./integration-secrets");
    const { ciphertext, iv, tag } = encrypt({ foo: "bar" });
    process.env.CONNECTION_ENCRYPTION_KEY =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decrypt(ciphertext, iv, tag)).toThrow();
  });

  it("throws if key missing", async () => {
    delete process.env.CONNECTION_ENCRYPTION_KEY;
    const mod = await import("./integration-secrets");
    expect(() => mod.encrypt({ foo: "bar" })).toThrow(/CONNECTION_ENCRYPTION_KEY/);
  });

  it("throws if key wrong length", async () => {
    process.env.CONNECTION_ENCRYPTION_KEY = "tooShort";
    const mod = await import("./integration-secrets");
    expect(() => mod.encrypt({ foo: "bar" })).toThrow(/64.*hex/i);
  });
});
