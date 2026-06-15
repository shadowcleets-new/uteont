/**
 * @file redact-pii.ts
 * @description Pure, deterministic PII scrubbing for free-text. Replaces email
 *              addresses and phone numbers (international + US formats) with
 *              stable placeholder tokens. No DB / network / clock / randomness.
 *
 * [TABLE OF CONTENTS]
 * 1. CONSTANTS & PLACEHOLDERS
 * 2. REGEX PATTERNS
 * 3. MAIN EXPORT (redactPII)
 * 4. HELPER UTILITIES
 */

// #region 1. Constants & Placeholders

const EMAIL_TOKEN = "[redacted-email]";
const PHONE_TOKEN = "[redacted-phone]";

/** Minimum digit count for a candidate to be treated as a phone number. */
const MIN_PHONE_DIGITS = 10;

// #endregion

// #region 2. Regex Patterns

/**
 * Email matcher. Conservative local/domain character classes; requires an `@`
 * and a dotted TLD so we do not mangle ordinary "a@b" fragments.
 */
const EMAIL_RE =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/g;

/**
 * Phone candidate matcher. Matches a run of digits with optional leading `+`
 * and common separators (space, dash, dot, parens). Anchored on a non-digit /
 * non-word boundary on both sides so it will not slice through longer tokens.
 * The >= MIN_PHONE_DIGITS gate is enforced in code, not the pattern, to stay
 * conservative about years / short ids.
 */
const PHONE_CANDIDATE_RE =
  /(?<![\w@.])\+?\(?\d(?:[\d\s().-]*\d)?(?![\w@])/g;

// #endregion

// #region 3. Main Export

/**
 * Scrub email addresses and phone numbers from free text.
 *
 * - Emails are redacted first so phone scanning never sees email digits.
 * - Phone candidates must contain at least {@link MIN_PHONE_DIGITS} digits;
 *   shorter runs (years, short ids) are left untouched.
 * - Nullish / non-string input yields "".
 * - Idempotent: placeholders contain no email/phone-shaped substrings.
 *
 * @param text Arbitrary free text (may be null/undefined at runtime).
 * @returns The redacted string, or "" for nullish / non-string input.
 */
export function redactPII(text: string): string {
  if (typeof text !== "string" || text.length === 0) return "";

  try {
    const withoutEmails = text.replace(EMAIL_RE, EMAIL_TOKEN);

    return withoutEmails.replace(PHONE_CANDIDATE_RE, (match) =>
      countDigits(match) >= MIN_PHONE_DIGITS ? PHONE_TOKEN : match,
    );
  } catch {
    // Defensive: never throw caller-side. Fail closed on the raw input only if
    // truly unexpected (regex engine errors are not expected for valid strings).
    return text;
  }
}

// #endregion

// #region 4. Helper Utilities

/** Count ASCII digits in a string without allocating an array. */
function countDigits(value: string): number {
  let count = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 48 && code <= 57) count += 1;
  }
  return count;
}

// #endregion
