/**
 * AES-256-GCM encryption helpers for site_integrations.config.
 *
 * Plaintext objects are JSON-stringified, then encrypted with a per-row IV.
 * The GCM auth tag is stored separately so callers can verify integrity on
 * decrypt. Throws loudly if CONNECTION_ENCRYPTION_KEY is missing or wrong
 * length — we never want to silently use a degenerate key.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const hex = process.env.CONNECTION_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "CONNECTION_ENCRYPTION_KEY env var not set — refusing to encrypt integration config",
    );
  }
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      "CONNECTION_ENCRYPTION_KEY must be 64 hex chars (32 bytes for AES-256)",
    );
  }
  return Buffer.from(hex, "hex");
}

export interface EncryptedBlob {
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
}

export function encrypt(plaintext: object): EncryptedBlob {
  const key = getKey();
  const iv = randomBytes(12); // GCM standard
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.from(JSON.stringify(plaintext), "utf8");
  const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decrypt(
  ciphertext: string,
  iv: string,
  tag: string,
): object {
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const enc = Buffer.from(ciphertext, "base64");
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}
