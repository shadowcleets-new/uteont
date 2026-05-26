/**
 * TypeScript port of the Python QA Agent — deterministic article checks.
 * Runs inline in Vercel functions (no worker round-trip needed).
 */

const DEFAULT_FORBIDDEN = new Set([
  "click here",
  "buy now",
  "guaranteed results",
  "make money fast",
]);

const DEFAULT_PASS_THRESHOLD = 70;

interface Issue {
  severity: "low" | "med" | "high";
  field: string;
  message: string;
}

export interface QaResult {
  score: number;
  approved: boolean;
  passThreshold: number;
  issues: Issue[];
  metrics: {
    wordCount: number;
    sentenceCount: number;
    fleschReadingEase: number;
    passiveVoicePercent: number;
    longSentenceCount: number;
  };
  plagiarismStatus: "not_checked";
  factualityStatus: "not_checked";
  checkedAt: string;
}

export function validate(opts: {
  article: string;
  targetKeyword?: string;
  forbidden?: Set<string>;
  passThreshold?: number;
}): QaResult {
  const forbidden = opts.forbidden ?? DEFAULT_FORBIDDEN;
  const passThreshold = opts.passThreshold ?? DEFAULT_PASS_THRESHOLD;

  const bodyText = stripMarkdown(opts.article);
  const words = tokenize(bodyText);
  const sentences = splitSentences(bodyText);

  const issues: Issue[] = [];
  let score = 100;

  if (words.length < 200) {
    issues.push({ severity: "high", field: "length",
      message: `Too short (${words.length} words) for meaningful QA` });
    score -= 20;
  }

  const fre = fleschReadingEase(words, sentences);
  if (fre < 30) {
    issues.push({ severity: "high", field: "readability",
      message: `Very difficult to read (FRE ${fre.toFixed(1)}). Aim for 60+.` });
    score -= 15;
  } else if (fre < 50) {
    issues.push({ severity: "med", field: "readability",
      message: `Difficult to read (FRE ${fre.toFixed(1)}). Aim for 60+.` });
    score -= 5;
  }

  const passiveCount = countPassiveSentences(sentences);
  const passivePct = (passiveCount / Math.max(1, sentences.length)) * 100;
  if (passivePct > 25) {
    issues.push({ severity: "med", field: "voice",
      message: `High passive voice (${passivePct.toFixed(0)}%). Aim for <20%.` });
    score -= 5;
  }

  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 30);
  if (longSentences.length > Math.max(1, sentences.length * 0.1)) {
    issues.push({ severity: "low", field: "sentence_length",
      message: `${longSentences.length} sentences over 30 words` });
    score -= 3;
  }

  const bodyLower = bodyText.toLowerCase();
  const forbiddenHits = [...forbidden].filter((w) => bodyLower.includes(w.toLowerCase()));
  if (forbiddenHits.length > 0) {
    issues.push({ severity: "high", field: "policy",
      message: `Forbidden phrases detected: ${forbiddenHits.join(", ")}` });
    score -= 10;
  }

  if (opts.targetKeyword && !bodyLower.includes(opts.targetKeyword.toLowerCase())) {
    issues.push({ severity: "high", field: "keyword",
      message: `Target keyword '${opts.targetKeyword}' not found in body` });
    score -= 10;
  }

  score = Math.max(0, score);
  const hasHigh = issues.some((i) => i.severity === "high");
  const approved = score >= passThreshold && !hasHigh;

  return {
    score,
    approved,
    passThreshold,
    issues,
    metrics: {
      wordCount: words.length,
      sentenceCount: sentences.length,
      fleschReadingEase: round1(fre),
      passiveVoicePercent: round1(passivePct),
      longSentenceCount: longSentences.length,
    },
    plagiarismStatus: "not_checked",
    factualityStatus: "not_checked",
    checkedAt: new Date().toISOString(),
  };
}

// --- helpers --------------------------------------------------------

function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`+([^`]+)`+/g, "$1")
    .replace(/\*+([^*]+)\*+/g, "$1")
    .replace(/_+([^_]+)_+/g, "$1");
}

function tokenize(text: string): string[] {
  return text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
}

function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function countSyllables(word: string): number {
  word = word.toLowerCase();
  const vowels = "aeiouy";
  let count = 0;
  let prevVowel = false;
  for (const ch of word) {
    const isVowel = vowels.includes(ch);
    if (isVowel && !prevVowel) count += 1;
    prevVowel = isVowel;
  }
  if (word.endsWith("e") && count > 1) count -= 1;
  return Math.max(1, count);
}

function fleschReadingEase(words: string[], sentences: string[]): number {
  if (words.length === 0 || sentences.length === 0) return 0;
  const totalSyllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const fre =
    206.835 - 1.015 * (words.length / sentences.length) -
    84.6 * (totalSyllables / words.length);
  return Math.max(0, Math.min(100, fre));
}

const BE_VERBS = new Set(["is", "was", "are", "were", "be", "been", "being"]);
const IRREGULAR_PP = new Set([
  "made","done","seen","given","taken","known","shown","thought","brought",
  "caught","kept","found","lost","written","spoken","broken","chosen","held","told",
]);

function countPassiveSentences(sentences: string[]): number {
  let count = 0;
  for (const s of sentences) {
    const words = (s.toLowerCase().match(/[a-z]+/g) ?? []);
    for (let i = 0; i < words.length - 1; i++) {
      if (BE_VERBS.has(words[i])) {
        const nxt = words[i + 1];
        if (nxt.endsWith("ed") || IRREGULAR_PP.has(nxt)) {
          count += 1;
          break;
        }
      }
    }
  }
  return count;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
