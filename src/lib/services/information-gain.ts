/**
 * @file information-gain.ts
 * @description Information-gain + coverage-gap engine (plan §C.4). Given our
 *   draft term set O and N competitor term/entity profiles, computes which
 *   terms we MUST cover (near-universal among competitors but absent from O),
 *   the highest-leverage information-GAIN terms (rare niche terms ranked by
 *   idf * intent weight), and a competitive target word count. Pure logic —
 *   deterministic, no DB / network / clock / randomness.
 *
 * [TABLE OF CONTENTS]
 * 1. TYPES & INTERFACES
 * 2. LOCAL CONSTANTS & CONFIG
 * 3. MAIN EXPORT (computeCoverageGap)
 * 4. HELPER UTILITIES (normalization, df, median, sorting)
 */

// #region 1. Types & Interfaces
export interface CompetitorProfile {
  terms: string[];
  entities?: string[];
  wordCount: number;
}

export interface CoverageGapOptions {
  /** Fraction of competitors that must cover a term for "mustCover". Default 0.6 */
  coverFrac?: number;
  /** Upper df fraction defining a rare "niche" term for gain. Default 0.3 */
  nicheFrac?: number;
  /** Max number of gain terms returned. Default 10 */
  topK?: number;
  /** Word-count multiplier applied to the competitor median. Default 1.15 */
  margin?: number;
  /** Per-term intent multiplier folded into the gain score. Default () => 1 */
  intentWeight?: (term: string) => number;
}

export interface CoverageGap {
  mustCover: string[];
  gain: string[];
  targetWordCount: number;
}
// #endregion

// #region 2. Local Constants & Config
const DEFAULTS = {
  coverFrac: 0.6,
  nicheFrac: 0.3,
  topK: 10,
  margin: 1.15,
  intentWeight: (_term: string): number => 1,
} as const;
// #endregion

// #region 3. Main Export
/**
 * Compute the coverage gap between our draft and a competitor set.
 *
 * Defensive throughout: malformed entries (missing arrays, non-finite word
 * counts, blank terms) are tolerated rather than thrown so a single bad
 * scrape never crashes the SEO engine.
 */
export function computeCoverageGap(
  ourTerms: Iterable<string>,
  profiles: CompetitorProfile[],
  opts: CoverageGapOptions = {},
): CoverageGap {
  const safeProfiles = Array.isArray(profiles) ? profiles : [];
  const N = safeProfiles.length;

  // Empty competitor set => nothing to compare against.
  if (N === 0) {
    return { mustCover: [], gain: [], targetWordCount: 0 };
  }

  const coverFrac = numOr(opts.coverFrac, DEFAULTS.coverFrac);
  const nicheFrac = numOr(opts.nicheFrac, DEFAULTS.nicheFrac);
  const topK = Math.max(0, Math.trunc(numOr(opts.topK, DEFAULTS.topK)));
  const margin = numOr(opts.margin, DEFAULTS.margin);
  const intentWeight =
    typeof opts.intentWeight === "function"
      ? opts.intentWeight
      : DEFAULTS.intentWeight;

  // Our normalized draft term set (case/whitespace insensitive, deduped).
  const ours = normalizeSet(ourTerms);

  // Document frequency: how many profiles' merged term-set holds each term.
  const df = computeDocumentFrequency(safeProfiles);

  // Thresholds: a term is "must cover" when >= ceil(coverFrac*N) competitors
  // hold it; "under covered" (niche) when 1 <= df <= floor(nicheFrac*N).
  const coverThreshold = Math.ceil(coverFrac * N);
  const nicheCap = Math.floor(nicheFrac * N);

  const mustCoverCandidates: Array<{ term: string; df: number }> = [];
  const underCovCandidates: Array<{ term: string; score: number }> = [];

  for (const [term, freq] of df) {
    if (freq >= coverThreshold && !ours.has(term)) {
      mustCoverCandidates.push({ term, df: freq });
    }
    if (freq >= 1 && freq <= nicheCap) {
      const score = idf(N, freq) * safeWeight(intentWeight, term);
      underCovCandidates.push({ term, score });
    }
  }

  // mustCover: df desc, then alphabetical (stable + deterministic).
  mustCoverCandidates.sort(
    (a, b) => b.df - a.df || a.term.localeCompare(b.term),
  );
  const mustCover = mustCoverCandidates.map((c) => c.term);

  // gain: score desc, then alphabetical; truncate to topK.
  underCovCandidates.sort(
    (a, b) => b.score - a.score || a.term.localeCompare(b.term),
  );
  const gain = underCovCandidates.slice(0, topK).map((c) => c.term);

  const targetWordCount = Math.round(medianWordCount(safeProfiles) * margin);

  return { mustCover, gain, targetWordCount };
}
// #endregion

// #region 4. Helper Utilities
/** Lowercase + trim a token; returns "" for nullish/blank input. */
function normToken(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/** Build a deduped, normalized Set from any iterable of strings. */
function normalizeSet(values: Iterable<string> | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!values) return out;
  for (const v of values) {
    const t = normToken(v);
    if (t) out.add(t);
  }
  return out;
}

/**
 * df(t): for each profile merge terms+entities into one normalized Set
 * (deduping repeats within a profile), then count how many profiles hold t.
 */
function computeDocumentFrequency(
  profiles: CompetitorProfile[],
): Map<string, number> {
  const df = new Map<string, number>();
  for (const profile of profiles) {
    const merged = new Set<string>();
    const terms = Array.isArray(profile?.terms) ? profile.terms : [];
    const entities = Array.isArray(profile?.entities) ? profile.entities : [];
    for (const t of terms) {
      const n = normToken(t);
      if (n) merged.add(n);
    }
    for (const e of entities) {
      const n = normToken(e);
      if (n) merged.add(n);
    }
    for (const term of merged) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  return df;
}

/** idf(t) = ln( N / (df(t) + 1) ). */
function idf(N: number, freq: number): number {
  return Math.log(N / (freq + 1));
}

/** Median of competitor word counts; non-finite counts coerce to 0. */
function medianWordCount(profiles: CompetitorProfile[]): number {
  const counts = profiles
    .map((p) => (Number.isFinite(p?.wordCount) ? Number(p.wordCount) : 0))
    .sort((a, b) => a - b);
  const n = counts.length;
  if (n === 0) return 0;
  const mid = n >> 1;
  return n % 2 === 1 ? counts[mid] : (counts[mid - 1] + counts[mid]) / 2;
}

/** Coerce a possibly-undefined numeric option to a finite fallback. */
function numOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Apply intentWeight defensively; non-finite results fall back to 1. */
function safeWeight(fn: (term: string) => number, term: string): number {
  try {
    const w = fn(term);
    return Number.isFinite(w) ? w : 1;
  } catch {
    // A caller-supplied weighter must never break the engine.
    return 1;
  }
}
// #endregion
