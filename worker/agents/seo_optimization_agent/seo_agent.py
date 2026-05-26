"""SEO Optimization Agent — pure-Python deterministic SEO linter.

Takes markdown article + optional target keyword. Returns a report with:
- score (0-100)
- issues (list of {severity, field, message})
- title analysis, heading hierarchy, word/sentence counts
- target keyword density
- suggested meta description (first sentence, truncated)
- suggested JSON-LD Article schema

No LLM required — heuristics + regex. Wire into the desktop app via
app/agents.py.

CLI:
    python -m agents.seo_optimization_agent.seo_agent --file path/to/article.md \
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


# --- helpers --------------------------------------------------------------

def _extract_title(article: str) -> str:
    m = re.search(r"^#\s+(.+)$", article, re.MULTILINE)
    return m.group(1).strip() if m else ""


def _extract_headings(article: str) -> list[dict]:
    out = []
    for m in re.finditer(r"^(#+)\s+(.+)$", article, re.MULTILINE):
        out.append({"level": len(m.group(1)), "text": m.group(2).strip()})
    return out


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


# --- main optimize() ------------------------------------------------------

def optimize(
    article: str,
    target_keyword: str | None = None,
    progress: ProgressFn = _no_progress,
) -> dict:
    progress("parsing markdown")
    title = _extract_title(article)
    headings = _extract_headings(article)
    body_text = _strip_markdown(article)
    words = _tokenize(body_text)
    sentences = _split_sentences(body_text)

    issues: list[dict] = []
    score = 100

    # --- title checks
    progress("analyzing title")
    title_len = len(title)
    if not title:
        issues.append({"severity": "high", "field": "title", "message": "No H1 title found"})
        score -= 20
    elif title_len < 30:
        issues.append({"severity": "med", "field": "title",
                       "message": f"Title is short ({title_len} chars). Aim for 50-60."})
        score -= 5
    elif title_len > 60:
        issues.append({"severity": "med", "field": "title",
                       "message": f"Title is long ({title_len} chars). Aim for 50-60."})
        score -= 5
    if target_keyword and title and target_keyword.lower() not in title.lower():
        issues.append({"severity": "high", "field": "title",
                       "message": f"Target keyword '{target_keyword}' missing from title"})
        score -= 15

    # --- heading hierarchy
    progress("checking heading hierarchy")
    h_levels = [h["level"] for h in headings]
    if not h_levels or h_levels[0] != 1:
        issues.append({"severity": "high", "field": "headings",
                       "message": "Article should start with H1"})
        score -= 10
    for i in range(1, len(h_levels)):
        if h_levels[i] - h_levels[i - 1] > 1:
            issues.append({"severity": "low", "field": "headings",
                           "message": f"Heading jump from H{h_levels[i-1]} to H{h_levels[i]}"})
            score -= 2

    # --- body
    progress("analyzing body")
    word_count = len(words)
    sentence_count = len(sentences)
    avg_sentence_len = word_count / sentence_count if sentence_count else 0
    if word_count < 300:
        issues.append({"severity": "high", "field": "body",
                       "message": f"Too short ({word_count} words). Aim for 800+."})
        score -= 15
    elif word_count < 800:
        issues.append({"severity": "med", "field": "body",
                       "message": f"Short article ({word_count} words). Aim for 800+."})
        score -= 5
    if avg_sentence_len > 25:
        issues.append({"severity": "low", "field": "readability",
                       "message": f"Long sentences (avg {avg_sentence_len:.1f} words). Aim for 15-20."})
        score -= 3

    # --- keyword density
    progress("calculating keyword density")
    densities: dict[str, float] = {}
    if target_keyword and word_count > 0:
        target_lower = target_keyword.lower()
        target_words = target_lower.split()
        n = len(target_words)
        occurrences = 0
        lower_words = [w.lower() for w in words]
        for i in range(len(lower_words) - n + 1):
            if lower_words[i:i + n] == target_words:
                occurrences += 1
        density = occurrences / max(1, word_count)
        densities[target_keyword] = round(density * 100, 3)
        if density < 0.005:
            issues.append({"severity": "med", "field": "keyword_density",
                           "message": f"Low density for '{target_keyword}' ({density*100:.2f}%). Aim for 0.5-2%."})
            score -= 8
        elif density > 0.03:
            issues.append({"severity": "med", "field": "keyword_density",
                           "message": f"High density ({density*100:.2f}%) — may be flagged as keyword stuffing."})
            score -= 5

    # --- meta description suggestion
    progress("generating meta description")
    if sentences:
        first = sentences[0]
        meta_desc = first[:152] + "..." if len(first) > 155 else first
    else:
        meta_desc = ""

    # --- JSON-LD schema
    progress("generating schema")
    schema = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title or "",
        "wordCount": word_count,
        "datePublished": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if target_keyword:
        schema["keywords"] = target_keyword

    score = max(0, score)
    return {
        "score": score,
        "issues": issues,
        "title": title,
        "title_length": title_len,
        "word_count": word_count,
        "sentence_count": sentence_count,
        "avg_sentence_length": round(avg_sentence_len, 1),
        "heading_structure": headings,
        "keyword_density_percent": densities,
        "suggested_meta_description": meta_desc,
        "suggested_meta_description_length": len(meta_desc),
        "suggested_schema_jsonld": schema,
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def _cli() -> int:
    p = argparse.ArgumentParser(description="SEO Optimization Agent — markdown SEO lint")
    p.add_argument("--file", type=Path, help="path to markdown file (alternative to stdin)")
    p.add_argument("--target-keyword", help="primary keyword to optimize for")
    args = p.parse_args()

    if args.file:
        article = args.file.read_text(encoding="utf-8")
    else:
        article = sys.stdin.read()

    if not article.strip():
        print("error: no article content provided", file=sys.stderr)
        return 1

    result = optimize(article, target_keyword=args.target_keyword,
                      progress=lambda m: print(f"[seo] {m}", file=sys.stderr))
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
