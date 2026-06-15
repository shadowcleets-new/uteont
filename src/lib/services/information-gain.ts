/**
 * @file information-gain.ts
 * @description IP-04 information-gain coverage-gap engine — the moat core.
 *   Given our current vocabulary and the top-N competitor profiles from the
 *   SERP, decide what we MUST cover to reach parity and which under-served
 *   ("information gain") terms let us beat the page. Pure functions over plain
 *   data — no DB, no clock, no RNG — so callers stay deterministic and the
 *   tests need no DATABASE_URL.
 *
 * [TABLE OF CONTENTS]
 * 1. TYPES & INTERFACES
 * 2. LOCAL CONSTANTS & DEFAULTS
 * 3. MAIN EXPORT — computeCoverageGap
 * 4. HELPER UTILITIES — vocabulary, median
 */

// #region 1. Types & Interfaces

export interface CompetitorProfile {
  terms: string[];
  entities?: string[];
  wordCount: number;
}

export interface CoverageGap {
  mustCover: string[];
  gain: string[];
  targetWordCount: number;
  df: Record<string, number>;
}

export interface CoverageOptions {
  mustCoverFraction?: number;
  underCoveredFraction?: number;
  gainK?: number;
  wordMargin?: number;
  intentWeight?: (term: string) => number;
}

// #endregion

// #region 2. Local Constants & Defaults

const DEFAULT_MUST_COVER_FRACTION = 0.6;
const DEFAULT_UNDER_COVERED_FRACTION = 0.3;
const DEFAULT_GAIN_K = 8;
const DEFAULT_WORD_MARGIN = 1.15;
const DEFAULT_INTENT_WEIGHT = (): number => 1;

// #endregion

// #region 3. Main Export — computeCoverageGap

/**
 * Coverage-gap decision over the top-N competitors.
 *
 *   df(t)  = number of competitor profiles whose (terms ∪ entities) contains t
 *   idf(t) = Math.log(N / (df(t) + 1))
 *
 *   mustCover    = { t : df(t) >= ceil(mustCoverFraction * N) AND t ∉ ourTerms }
 *   underCovered = { t : 1 <= df(t) <= floor(underCoveredFraction * N) }
 *   gain         = top-K underCovered ranked by idf(t) * intentWeight(t) desc,
 *                  tie-break alphabetical; K = gainK
 *   targetWordCount = round(median(wordCounts) * wordMargin)
 *
 * All term comparisons are case-insensitive (everything is lowercased). With
 * N=0 the gap is empty and targetWordCount is 0.
 */
export function computeCoverageGap(
  ourTerms: Set<string>,
  competitors: CompetitorProfile[],
  opts: CoverageOptions = {},
): CoverageGap {
  const mustCoverFraction =
    opts.mustCoverFraction ?? DEFAULT_MUST_COVER_FRACTION;
  const underCoveredFraction =
    opts.underCoveredFraction ?? DEFAULT_UNDER_COVERED_FRACTION;
  const gainK = opts.gainK ?? DEFAULT_GAIN_K;
  const wordMargin = opts.wordMargin ?? DEFAULT_WORD_MARGIN;
  const intentWeight = opts.intentWeight ?? DEFAULT_INTENT_WEIGHT;

  const n = competitors.length;

  // Edge case: no competitors -> nothing to cover, no target.
  if (n === 0) {
    return { mustCover: [], gain: [], targetWordCount: 0, df: {} };
  }

  // Lowercase our vocabulary once for case-insensitive membership checks.
  const ourLower = new Set<string>();
  for (const t of ourTerms) ourLower.add(t.toLowerCase());

  // df(t): count profiles (not raw occurrences) whose deduped vocab holds t.
  const df: Record<string, number> = {};
  for (const c of competitors) {
    for (const t of profileVocabulary(c)) {
      df[t] = (df[t] ?? 0) + 1;
    }
  }

  const mustCoverThreshold = Math.ceil(mustCoverFraction * n);
  const underCoveredCeiling = Math.floor(underCoveredFraction * n);

  const mustCover: string[] = [];
  const underCovered: string[] = [];
  for (const [t, count] of Object.entries(df)) {
    if (count >= mustCoverThreshold && !ourLower.has(t)) {
      mustCover.push(t);
    }
    if (count >= 1 && count <= underCoveredCeiling) {
      underCovered.push(t);
    }
  }

  // Stable output: mustCover alphabetical.
  mustCover.sort();

  // Rank under-served terms by idf * intentWeight desc, tie-break alphabetical.
  const gain = underCovered
    .map((t) => ({
      term: t,
      score: idf(n, df[t]) * intentWeight(t),
    }))
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.term < b.term
          ? -1
          : a.term > b.term
            ? 1
            : 0,
    )
    .slice(0, gainK)
    .map((x) => x.term);

  const targetWordCount = Math.round(
    median(competitors.map((c) => c.wordCount)) * wordMargin,
  );

  return { mustCover, gain, targetWordCount, df };
}

// #endregion

// #region 4. Helper Utilities — vocabulary, median, idf

/** idf(t) = log(N / (df(t) + 1)). Pure; rarer terms score higher. */
function idf(n: number, dfT: number): number {
  return Math.log(n / (dfT + 1));
}

/**
 * The deduped, lowercased vocabulary of a single competitor profile: the
 * union of its terms and entities. A term that appears in both (or twice in
 * terms) counts once toward df for this profile.
 */
function profileVocabulary(c: CompetitorProfile): Set<string> {
  const vocab = new Set<string>();
  for (const t of c.terms) vocab.add(t.toLowerCase());
  for (const e of c.entities ?? []) vocab.add(e.toLowerCase());
  return vocab;
}

/**
 * Median of a numeric list. Even length averages the two middle values.
 * Median of an empty list is 0 (so callers never divide by an absent center).
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// #endregion
