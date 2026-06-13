/**
 * @file digest-equal.ts
 * @description Length-independent constant-time secret comparison. The plain
 * char-by-char safeEqual iterates max(a.length, b.length) times, so its timing
 * leaks the secret's length (an attacker can binary-search the inflection point
 * where their input length crosses the secret's). This version SHA-256-digests
 * both inputs first and compares the two fixed 32-byte digests, so the timing is
 * constant regardless of input length and reveals nothing about it.
 *
 * Uses Web Crypto (`crypto.subtle`), available in both the Edge and Node
 * runtimes — so middleware (Edge) and Node services can share it. Async.
 */

async function sha256Bytes(s: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(buf);
}

/**
 * Constant-time, length-independent equality for two secrets. Returns false
 * (never throws) for empty/undefined inputs. Compares fixed-size SHA-256
 * digests so iteration count never depends on input length.
 */
export async function safeEqualDigest(
  a: string | undefined | null,
  b: string | undefined | null,
): Promise<boolean> {
  if (!a || !b) return false;
  const [da, db] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  // Both digests are 32 bytes; fold every byte difference into one accumulator.
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}
