/**
 * @file content-safety.ts
 * @description Pure output-safety checks for generated drafts (IP-90).
 *              Detects banned phrases (case-insensitive substring) and
 *              plagiarism (verbatim n-gram overlap with supplied sources).
 *              No DB, no network, no clock, no randomness — deterministic.
 *
 * [TABLE OF CONTENTS]
 * 1. TYPES & INTERFACES
 * 2. LOCAL CONSTANTS & CONFIG
 * 3. MAIN EXPORT — checkContentSafety
 * 4. HELPER UTILITIES (tokenize, detectors)
 */

// #region 1. Types & Interfaces

export interface SafetyOptions {
  bannedPhrases?: string[];
  sources?: string[];
  /** Contiguous word window for plagiarism detection. Default 8. */
  ngram?: number;
}

export interface SafetyViolation {
  kind: "banned-phrase" | "plagiarism";
  detail: string;
}

export interface SafetyReport {
  ok: boolean;
  violations: SafetyViolation[];
}

// #endregion

// #region 2. Local Constants & Config

const DEFAULT_NGRAM = 8;
/** Hard cap on a violation detail string to avoid unbounded payloads. */
const MAX_DETAIL_LEN = 200;
const TRUNCATION_SUFFIX = "…";

// #endregion

// #region 3. Main Export — checkContentSafety

/**
 * Inspect a draft for banned phrases and plagiarised runs.
 * Defensive: empty/nullish draft or no options yields a clean report.
 */
export function checkContentSafety(
  draft: string,
  opts?: SafetyOptions,
): SafetyReport {
  const violations: SafetyViolation[] = [];

  // Defensive: nothing to inspect.
  if (typeof draft !== "string" || draft.length === 0) {
    return { ok: true, violations };
  }
  if (!opts || typeof opts !== "object") {
    return { ok: true, violations };
  }

  collectBannedPhraseViolations(draft, opts.bannedPhrases, violations);
  collectPlagiarismViolations(draft, opts.sources, opts.ngram, violations);

  return { ok: violations.length === 0, violations };
}

// #endregion

// #region 4. Helper Utilities

/**
 * Lowercase word tokens. Splits on any non-word run so punctuation between
 * words does not defeat verbatim matching.
 */
function tokenize(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

function clampDetail(detail: string): string {
  if (detail.length <= MAX_DETAIL_LEN) return detail;
  return detail.slice(0, MAX_DETAIL_LEN - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

/** Case-insensitive substring match for each non-empty banned phrase. */
function collectBannedPhraseViolations(
  draft: string,
  bannedPhrases: string[] | undefined,
  out: SafetyViolation[],
): void {
  if (!Array.isArray(bannedPhrases) || bannedPhrases.length === 0) return;

  const haystack = draft.toLowerCase();
  const seen = new Set<string>();

  for (const raw of bannedPhrases) {
    if (typeof raw !== "string") continue;
    const phrase = raw.trim();
    if (phrase.length === 0) continue;

    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;

    if (haystack.includes(key)) {
      seen.add(key);
      out.push({
        kind: "banned-phrase",
        detail: clampDetail(`banned phrase: "${phrase}"`),
      });
    }
  }
}

/**
 * Flag the first verbatim n-gram (default 8 words) of the draft that appears
 * contiguously in any source. One violation per source overlap.
 */
function collectPlagiarismViolations(
  draft: string,
  sources: string[] | undefined,
  ngram: number | undefined,
  out: SafetyViolation[],
): void {
  if (!Array.isArray(sources) || sources.length === 0) return;

  const n =
    typeof ngram === "number" && Number.isFinite(ngram) && ngram >= 1
      ? Math.floor(ngram)
      : DEFAULT_NGRAM;

  const draftTokens = tokenize(draft);
  if (draftTokens.length < n) return;

  // Build the set of draft n-grams once (joined for O(1) lookups).
  const draftGrams = buildNgramSet(draftTokens, n);
  if (draftGrams.size === 0) return;

  for (const source of sources) {
    if (typeof source !== "string" || source.length === 0) continue;
    const srcTokens = tokenize(source);
    if (srcTokens.length < n) continue;

    const match = firstOverlap(srcTokens, n, draftTokens, draftGrams);
    if (match) {
      out.push({
        kind: "plagiarism",
        detail: clampDetail(`overlapping run: "${match}"`),
      });
    }
  }
}

function buildNgramSet(tokens: string[], n: number): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) {
    set.add(tokens.slice(i, i + n).join(" "));
  }
  return set;
}

/**
 * Find the first source n-gram present in the draft, then greedily expand it
 * to the maximal contiguous run shared by both — so the cited detail reflects
 * the full overlap, not just the seed window. Returns null when none overlap.
 */
function firstOverlap(
  srcTokens: string[],
  n: number,
  draftTokens: string[],
  draftGrams: Set<string>,
): string | null {
  for (let i = 0; i + n <= srcTokens.length; i++) {
    const gram = srcTokens.slice(i, i + n).join(" ");
    if (!draftGrams.has(gram)) continue;

    // Locate the seed window in the draft so we can extend on both sides.
    const dStart = indexOfRun(draftTokens, srcTokens, i, n);
    if (dStart === -1) return gram; // defensive: fall back to the seed

    let s = i;
    let d = dStart;
    let len = n;
    // Extend rightward.
    while (
      s + len < srcTokens.length &&
      d + len < draftTokens.length &&
      srcTokens[s + len] === draftTokens[d + len]
    ) {
      len++;
    }
    // Extend leftward.
    while (s > 0 && d > 0 && srcTokens[s - 1] === draftTokens[d - 1]) {
      s--;
      d--;
      len++;
    }
    return draftTokens.slice(d, d + len).join(" ");
  }
  return null;
}

/** Index in draftTokens where the source run [start, start+n) first matches. */
function indexOfRun(
  draftTokens: string[],
  srcTokens: string[],
  start: number,
  n: number,
): number {
  for (let d = 0; d + n <= draftTokens.length; d++) {
    let match = true;
    for (let k = 0; k < n; k++) {
      if (draftTokens[d + k] !== srcTokens[start + k]) {
        match = false;
        break;
      }
    }
    if (match) return d;
  }
  return -1;
}

// #endregion
