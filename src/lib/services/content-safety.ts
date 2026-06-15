/**
 * @file content-safety.ts
 * @description Output safety checks (IP-90) — a pure, dependency-free lint
 *   that can hard-block a publish. Two concerns: (1) banned-phrase detection
 *   (case-insensitive substring), and (2) plagiarism via word-level 8-gram
 *   overlap against each candidate source. Fully deterministic — no clock,
 *   no randomness, no I/O — so it runs identically on server or client and
 *   needs no DATABASE_URL to test.
 *
 * [TABLE OF CONTENTS]
 * 1. TYPES & INTERFACES
 * 2. LOCAL CONSTANTS & CONFIG
 * 3. MAIN EXPORT — checkContentSafety
 * 4. HELPER UTILITIES — tokenization & n-gram overlap
 */

// #region 1. Types & Interfaces

export interface SafetyInput {
  draft: string;
  bannedPhrases?: string[];
  sources?: string[];
}

export type SafetySeverity = "block" | "warn";

export interface SafetyViolation {
  kind: "banned_phrase" | "plagiarism";
  severity: SafetySeverity;
  detail: string;
}

export interface SafetyResult {
  ok: boolean;
  hardFail: boolean;
  violations: SafetyViolation[];
  /** Max distinct-8-gram overlap fraction across all sources, in [0, 1]. */
  maxOverlap: number;
}

// #endregion

// #region 2. Local Constants & Config

/** Word-level n-gram width used for the plagiarism overlap measure. */
const NGRAM = 8;

/** At or above this overlap fraction a verbatim echo hard-blocks the publish. */
const PLAGIARISM_BLOCK = 0.2;

/** At or above this (but below the block floor) we surface a soft warning. */
const PLAGIARISM_WARN = 0.08;

// #endregion

// #region 3. Main Export — checkContentSafety

/**
 * Lint a draft for publish safety. Banned phrases each yield a hard 'block';
 * plagiarism overlap yields a 'block' (>= 0.20) or 'warn' (>= 0.08). The
 * result is ok only when nothing fired, and hardFails when any 'block' fired.
 */
export function checkContentSafety(input: SafetyInput): SafetyResult {
  const draft = input.draft ?? "";
  const bannedPhrases = input.bannedPhrases ?? [];
  const sources = input.sources ?? [];

  const violations: SafetyViolation[] = [];

  // (1) Banned phrases — case-insensitive substring, one block each. An empty
  // draft can match nothing, so this loop is naturally a no-op for "".
  const haystack = draft.toLowerCase();
  for (const phrase of bannedPhrases) {
    const needle = phrase.trim().toLowerCase();
    if (needle && haystack.includes(needle)) {
      violations.push({
        kind: "banned_phrase",
        severity: "block",
        detail: `Banned phrase present: "${phrase}"`,
      });
    }
  }

  // (2) Plagiarism — distinct draft 8-gram overlap, maxed over sources.
  const maxOverlap = computeMaxOverlap(draft, sources);
  if (maxOverlap >= PLAGIARISM_BLOCK) {
    violations.push({
      kind: "plagiarism",
      severity: "block",
      detail: `Source overlap ${(maxOverlap * 100).toFixed(1)}% exceeds the ${(
        PLAGIARISM_BLOCK * 100
      ).toFixed(0)}% block threshold`,
    });
  } else if (maxOverlap >= PLAGIARISM_WARN) {
    violations.push({
      kind: "plagiarism",
      severity: "warn",
      detail: `Source overlap ${(maxOverlap * 100).toFixed(1)}% exceeds the ${(
        PLAGIARISM_WARN * 100
      ).toFixed(0)}% warning threshold`,
    });
  }

  const hardFail = violations.some((v) => v.severity === "block");
  const ok = violations.length === 0;

  return { ok, hardFail, violations, maxOverlap };
}

// #endregion

// #region 4. Helper Utilities — tokenization & n-gram overlap

/** Lowercase and split on word characters; drops punctuation and whitespace. */
function tokenize(text: string): string[] {
  const matched = text.toLowerCase().match(/\w+/g);
  return matched ?? [];
}

/** Build the set of distinct word-level n-grams (joined by a space) for a token list. */
function distinctNgrams(tokens: string[], n: number): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) {
    grams.add(tokens.slice(i, i + n).join(" "));
  }
  return grams;
}

/**
 * Maximum distinct draft-8-gram overlap fraction across all sources:
 *   max over sources of |draft 8-grams ∩ source 8-grams| / |draft 8-grams|.
 * Returns 0 defensively when there are no sources or the draft has < 8 words
 * (too short to form a single 8-gram).
 */
function computeMaxOverlap(draft: string, sources: string[]): number {
  if (sources.length === 0) return 0;

  const draftTokens = tokenize(draft);
  if (draftTokens.length < NGRAM) return 0;

  const draftGrams = distinctNgrams(draftTokens, NGRAM);
  const total = draftGrams.size;
  if (total === 0) return 0;

  let best = 0;
  for (const source of sources) {
    const sourceGrams = distinctNgrams(tokenize(source), NGRAM);
    if (sourceGrams.size === 0) continue;
    let hits = 0;
    for (const gram of draftGrams) {
      if (sourceGrams.has(gram)) hits++;
    }
    const overlap = hits / total;
    if (overlap > best) best = overlap;
  }
  return best;
}

// #endregion
