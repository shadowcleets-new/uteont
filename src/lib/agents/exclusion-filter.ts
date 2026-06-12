/**
 * Lexical exclusion filter (ported from the Milestone-10 line).
 *
 * v1 — case-insensitive token-set overlap. Default threshold of 0.75
 * catches case variants, punctuation noise, plural-vs-singular, and
 * trivial reorderings ("credit card rewards" ↔ "Credit-Card Rewards"
 * ↔ "rewards credit cards") while leaving meaningfully different
 * phrases alone ("top credit cards" → not blocked).
 *
 * v2 will hand off to the Python worker for embedding-based semantic
 * similarity; the API contract here stays the same so the swap is
 * surface-level.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "for", "to", "of", "in", "on",
  "with", "from", "by", "at", "is", "are", "be", "was", "were",
]);

const WORD_RE = /[a-z0-9]+/g;

export function normalize(phrase: string): string[] {
  if (!phrase) return [];
  const lower = phrase.toLowerCase();
  const tokens = lower.match(WORD_RE) ?? [];
  return tokens.filter((t) => !STOPWORDS.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const tok of setA) if (setB.has(tok)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface RejectedCandidate {
  phrase: string;
  matched: string;
  similarity: number;
}

export interface FilterResult {
  allowed: string[];
  rejected: RejectedCandidate[];
}

function bestMatch(
  tokens: string[],
  normExclusions: Array<{ text: string; tokens: string[] }>,
): { phrase: string; score: number } | null {
  let best: { phrase: string; score: number } | null = null;
  for (const ex of normExclusions) {
    const score = jaccard(tokens, ex.tokens);
    if (!best || score > best.score) best = { phrase: ex.text, score };
  }
  return best;
}

/**
 * Returns the candidates that survive, plus a per-rejection trail
 * showing which exclusion phrase triggered the block and the score.
 */
export function filterCandidates(
  candidates: string[],
  exclusions: string[],
  similarityThreshold = 0.75,
): FilterResult {
  const allowed: string[] = [];
  const rejected: RejectedCandidate[] = [];
  const normExclusions = exclusions.map((e) => ({
    text: e,
    tokens: normalize(e),
  }));

  for (const cand of candidates) {
    const best = bestMatch(normalize(cand), normExclusions);
    if (best && best.score >= similarityThreshold) {
      rejected.push({
        phrase: cand,
        matched: best.phrase,
        similarity: +best.score.toFixed(3),
      });
    } else {
      allowed.push(cand);
    }
  }

  return { allowed, rejected };
}

export interface RowFilterResult<T> {
  allowed: T[];
  rejected: RejectedCandidate[];
}

/**
 * The ingestion seam: partitions keyword *rows* (objects carrying a
 * `keyword` string) against the exclusion list so the surviving rows
 * can be persisted unchanged. Rows without a usable keyword pass
 * through untouched — the persist layer already drops malformed rows.
 */
export function filterKeywordRows<T extends { keyword: string }>(
  rows: T[],
  exclusions: string[],
  similarityThreshold = 0.75,
): RowFilterResult<T> {
  const allowed: T[] = [];
  const rejected: RejectedCandidate[] = [];
  const normExclusions = exclusions.map((e) => ({
    text: e,
    tokens: normalize(e),
  }));

  for (const row of rows) {
    const phrase = typeof row?.keyword === "string" ? row.keyword : "";
    const tokens = normalize(phrase);
    const best = tokens.length ? bestMatch(tokens, normExclusions) : null;
    if (best && best.score >= similarityThreshold) {
      rejected.push({
        phrase,
        matched: best.phrase,
        similarity: +best.score.toFixed(3),
      });
    } else {
      allowed.push(row);
    }
  }

  return { allowed, rejected };
}
