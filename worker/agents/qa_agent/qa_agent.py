"""QA / Validation Agent — readability + passive voice + policy + target keyword.

Pure-Python deterministic checks. Plagiarism and factuality are marked
as `not_checked` until an LLM-backed implementation lands later.

CLI:
    python -m agents.qa_agent.qa_agent --file path/to/article.md \
        --target-keyword "ai writing tools"
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

ProgressFn = Callable[[str], None]


def _no_progress(_msg: str) -> None:
    pass


# Default forbidden phrases — easily overridden by passing `forbidden=` to validate().
DEFAULT_FORBIDDEN: set[str] = {
    "click here",
    "buy now",
    "guaranteed results",
    "make money fast",
}

DEFAULT_PASS_THRESHOLD = 70


# --- helpers --------------------------------------------------------------

def _strip_markdown(text: str) -> str:
    t = re.sub(r"^#+\s+", "", text, flags=re.MULTILINE)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    t = re.sub(r"`+([^`]+)`+", r"\1", t)
    t = re.sub(r"\*+([^*]+)\*+", r"\1", t)
    t = re.sub(r"_+([^_]+)_+", r"\1", t)
    return t


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]


def _count_syllables(word: str) -> int:
    word = word.lower()
    vowels = "aeiouy"
    count = 0
    prev_vowel = False
    for ch in word:
        is_vowel = ch in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def _flesch_reading_ease(words: list[str], sentences: list[str]) -> float:
    if not words or not sentences:
        return 0.0
    total_syllables = sum(_count_syllables(w) for w in words)
    fre = (
        206.835
        - 1.015 * (len(words) / len(sentences))
        - 84.6 * (total_syllables / len(words))
    )
    return max(0.0, min(100.0, fre))


# Heuristic passive-voice detection: "be"-verb followed by a likely past
# participle (regular -ed ending OR irregular pp from a small whitelist).
_BE_VERBS = {"is", "was", "are", "were", "be", "been", "being"}
_IRREGULAR_PP = {
    "made", "done", "seen", "given", "taken", "known", "shown",
    "thought", "brought", "caught", "kept", "found", "lost",
    "written", "spoken", "broken", "chosen", "held", "told",
}


def _count_passive_sentences(sentences: list[str]) -> int:
    count = 0
    for s in sentences:
        words = re.findall(r"[A-Za-z]+", s.lower())
        for i in range(len(words) - 1):
            if words[i] in _BE_VERBS:
                nxt = words[i + 1]
                if nxt.endswith("ed") or nxt in _IRREGULAR_PP:
                    count += 1
                    break
    return count


# --- main validate() -----------------------------------------------------

def validate(
    article: str,
    target_keyword: str | None = None,
    forbidden: set[str] | None = None,
    pass_threshold: int = DEFAULT_PASS_THRESHOLD,
    progress: ProgressFn = _no_progress,
) -> dict:
    forbidden = forbidden if forbidden is not None else DEFAULT_FORBIDDEN

    progress("tokenizing")
    body_text = _strip_markdown(article)
    words = _tokenize(body_text)
    sentences = _split_sentences(body_text)

    issues: list[dict] = []
    score = 100

    # length
    if len(words) < 200:
        issues.append({"severity": "high", "field": "length",
                       "message": f"Too short ({len(words)} words) for meaningful QA"})
        score -= 20

    # readability
    progress("computing readability")
    fre = _flesch_reading_ease(words, sentences)
    if fre < 30:
        issues.append({"severity": "high", "field": "readability",
                       "message": f"Very difficult to read (FRE {fre:.1f}). Aim for 60+."})
        score -= 15
    elif fre < 50:
        issues.append({"severity": "med", "field": "readability",
                       "message": f"Difficult to read (FRE {fre:.1f}). Aim for 60+."})
        score -= 5

    # passive voice
    progress("detecting passive voice")
    passive_count = _count_passive_sentences(sentences)
    passive_pct = (passive_count / max(1, len(sentences))) * 100
    if passive_pct > 25:
        issues.append({"severity": "med", "field": "voice",
                       "message": f"High passive voice ({passive_pct:.0f}%). Aim for <20%."})
        score -= 5

    # long sentences
    long_sentences = [s for s in sentences if len(s.split()) > 30]
    if len(long_sentences) > max(1, len(sentences) * 0.1):
        issues.append({"severity": "low", "field": "sentence_length",
                       "message": f"{len(long_sentences)} sentences over 30 words"})
        score -= 3

    # policy / forbidden phrases
    progress("checking policy")
    body_lower = body_text.lower()
    forbidden_hits = sorted({w for w in forbidden if w.lower() in body_lower})
    if forbidden_hits:
        issues.append({"severity": "high", "field": "policy",
                       "message": f"Forbidden phrases detected: {forbidden_hits}"})
        score -= 10

    # target keyword
    if target_keyword and target_keyword.lower() not in body_lower:
        issues.append({"severity": "high", "field": "keyword",
                       "message": f"Target keyword '{target_keyword}' not found in body"})
        score -= 10

    score = max(0, score)
    has_high = any(i["severity"] == "high" for i in issues)
    approved = score >= pass_threshold and not has_high

    return {
        "score": score,
        "approved": approved,
        "pass_threshold": pass_threshold,
        "issues": issues,
        "metrics": {
            "word_count": len(words),
            "sentence_count": len(sentences),
            "flesch_reading_ease": round(fre, 1),
            "passive_voice_percent": round(passive_pct, 1),
            "long_sentence_count": len(long_sentences),
        },
        "plagiarism_status": "not_checked",
        "factuality_status": "not_checked",
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def _cli() -> int:
    p = argparse.ArgumentParser(description="QA / Validation Agent")
    p.add_argument("--file", type=Path, help="path to markdown file (alternative to stdin)")
    p.add_argument("--target-keyword", help="target keyword that must appear in body")
    p.add_argument("--threshold", type=int, default=DEFAULT_PASS_THRESHOLD,
                   help=f"pass score (default {DEFAULT_PASS_THRESHOLD})")
    args = p.parse_args()

    if args.file:
        article = args.file.read_text(encoding="utf-8")
    else:
        article = sys.stdin.read()
    if not article.strip():
        print("error: no article content provided", file=sys.stderr)
        return 1

    result = validate(
        article,
        target_keyword=args.target_keyword,
        pass_threshold=args.threshold,
        progress=lambda m: print(f"[qa] {m}", file=sys.stderr),
    )
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
