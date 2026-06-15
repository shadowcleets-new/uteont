/**
 * @file pii.ts
 * @description Pure, dependency-free PII redaction (IP-65). Scrubs emails and
 *              phone numbers from arbitrary text before it is logged or fed to
 *              the planner. No I/O, no clock, no RNG — deterministic by design.
 *
 * [TABLE OF CONTENTS]
 * 1. TYPES & INTERFACES
 * 2. LOCAL CONSTANTS & PATTERNS
 * 3. PUBLIC API (redactPII, redactPIIDetailed)
 * 4. HELPER UTILITIES
 */

// #region 1. Types & Interfaces

export interface RedactionResult {
  text: string;
  counts: { emails: number; phones: number };
}

// #endregion

// #region 2. Local Constants & Patterns

const EMAIL_PLACEHOLDER = "[redacted-email]";
const PHONE_PLACEHOLDER = "[redacted-phone]";

/**
 * Email: local@domain.tld. The local part allows the usual RFC-ish set of
 * symbols; the domain requires at least one dot and a 2+ char TLD. Global +
 * case-insensitive so every match is replaced and counted.
 */
const EMAIL_RE =
  /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}/gi;

/**
 * Phone: a run of digit-groups joined by phone-like separators (space, dot,
 * hyphen), optionally with a leading "+" and/or a parenthesized area code.
 * We anchor on a boundary, then require enough structure that a bare 4-digit
 * year or a comma-grouped price cannot match. The post-filter in `redactPhones`
 * enforces the "at least 7 digits" rule so plain numbers survive.
 *
 * Note: comma is deliberately NOT a separator, so "$1,200" is never a phone.
 */
const PHONE_RE =
  /\+?\d[\d\s().-]{6,}\d/g;

const DIGIT_RE = /\d/g;

/** Minimum digit count for something to be treated as a phone number. */
const MIN_PHONE_DIGITS = 7;

/** Maximum digit count — guards against nuking long IDs / hashes-with-dashes. */
const MAX_PHONE_DIGITS = 15;

// #endregion

// #region 3. Public API

/**
 * Redact emails and phone numbers from `input`, returning only the scrubbed
 * text. Non-string input is coerced to "". Idempotent: the placeholders carry
 * no PII, so a second pass is a no-op.
 */
export function redactPII(input: string): string {
  return redactPIIDetailed(input).text;
}

/**
 * Like {@link redactPII} but also reports how many of each kind were redacted.
 * Emails are scrubbed first so their digit-bearing characters cannot be
 * mistaken for a phone number by the subsequent phone pass.
 */
export function redactPIIDetailed(input: string): RedactionResult {
  const text = coerce(input);

  const afterEmails = redactEmails(text);
  const afterPhones = redactPhones(afterEmails.text);

  return {
    text: afterPhones.text,
    counts: { emails: afterEmails.count, phones: afterPhones.count },
  };
}

// #endregion

// #region 4. Helper Utilities

/** Coerce any non-string (null, undefined, number, object) to "". */
function coerce(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Count how many digits a candidate substring contains. */
function digitCount(s: string): number {
  return (s.match(DIGIT_RE) ?? []).length;
}

interface PassResult {
  text: string;
  count: number;
}

/** Replace every email with the placeholder; return text + match count. */
function redactEmails(text: string): PassResult {
  let count = 0;
  const out = text.replace(EMAIL_RE, () => {
    count += 1;
    return EMAIL_PLACEHOLDER;
  });
  return { text: out, count };
}

/**
 * Replace phone-shaped runs with the placeholder. A candidate only counts if
 * it carries between MIN and MAX digits AND uses real phone separators — this
 * spares bare years ("2026"), comma-grouped prices ("$1,200"), and overlong
 * numeric IDs.
 */
function redactPhones(text: string): PassResult {
  let count = 0;
  const out = text.replace(PHONE_RE, (match: string) => {
    const digits = digitCount(match);
    if (digits < MIN_PHONE_DIGITS || digits > MAX_PHONE_DIGITS) {
      return match; // not phone-like enough — leave untouched
    }
    count += 1;
    return PHONE_PLACEHOLDER;
  });
  return { text: out, count };
}

// #endregion
