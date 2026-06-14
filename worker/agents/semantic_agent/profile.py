#!/usr/bin/env python3
"""
profile.py — IP-03 · semantic profile deconstruction (pure structure core).

``extract_structure(html)`` turns a competitor document into the signals the
information-gain engine needs to out-cover it: the heading outline (document
order), a visible-text word count (script/style excluded), and a deduped,
frequency-ranked list of proper-noun entities. Pure + deterministic — stdlib
only, no network/DB/clock (the fetch + embedding shell lives elsewhere).

[TABLE OF CONTENTS]
1. IMPORTS & DEPENDENCIES
2. CONSTANTS (regex + stopwords)
3. PUBLIC API — extract_structure
4. HELPERS (strip, headings, entities)
"""

# #region 1. Imports & Dependencies
from __future__ import annotations

import html as _html
import re
from collections import Counter
from typing import Dict, List
# #endregion


# #region 2. Constants (regex + stopwords)
_SCRIPT_STYLE_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_HEADING_RE = re.compile(r"<h([1-6])\b[^>]*>(.*?)</h\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
# A proper-noun-ish phrase: one or more consecutive Capitalized words.
_ENTITY_RE = re.compile(r"\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b")

# Single-word, sentence-initial function words that masquerade as entities.
_STOPWORDS = {
    "The", "A", "An", "This", "That", "These", "Those", "It", "We", "You",
    "Our", "Your", "Their", "His", "Her", "Its", "I", "In", "On", "At", "To",
    "Of", "And", "But", "For", "With", "Welcome", "Many", "Some", "Most",
    "All", "Each", "Every", "There", "Here", "When", "Where", "While", "If",
}
_LEADING_ARTICLES = {"The", "A", "An"}
# #endregion


# #region 3. Public API — extract_structure
def extract_structure(html_text: str) -> Dict[str, object]:
    """Return ``{"headings": [...], "word_count": int, "entities": [...]}``.

    Defensive: an empty/None/non-str input or malformed markup never raises —
    it degrades to empty fields."""
    if not html_text or not isinstance(html_text, str):
        return {"headings": [], "word_count": 0, "entities": []}

    # 1. Drop script/style content entirely so it can't pollute text/entities.
    cleaned = _SCRIPT_STYLE_RE.sub(" ", html_text)

    # 2. Headings, in document order.
    headings = _extract_headings(cleaned)

    # 3. Visible text → word count + entities.
    visible = _visible_text(cleaned)
    word_count = len(visible.split()) if visible else 0
    entities = _extract_entities(visible)

    return {"headings": headings, "word_count": word_count, "entities": entities}
# #endregion


# #region 4. Helpers (strip, headings, entities)
def _visible_text(cleaned_html: str) -> str:
    text = _TAG_RE.sub(" ", cleaned_html)
    text = _html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def _extract_headings(cleaned_html: str) -> List[str]:
    out: List[str] = []
    for _level, inner in _HEADING_RE.findall(cleaned_html):
        text = _WS_RE.sub(" ", _html.unescape(_TAG_RE.sub(" ", inner))).strip()
        if text:
            out.append(text)
    return out


def _normalize_entity(phrase: str) -> str:
    parts = phrase.split()
    # Strip a leading article so "The Empire State Building" → "Empire State Building".
    if len(parts) > 1 and parts[0] in _LEADING_ARTICLES:
        parts = parts[1:]
    return " ".join(parts)


def _extract_entities(visible_text: str) -> List[str]:
    counts: Counter[str] = Counter()
    for match in _ENTITY_RE.findall(visible_text):
        entity = _normalize_entity(match)
        if not entity:
            continue
        # Drop single-word function-word noise; always keep multi-word phrases.
        if " " not in entity and entity in _STOPWORDS:
            continue
        counts[entity] += 1
    # Frequency desc, then alphabetical — deterministic and stable.
    return [e for e, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]
# #endregion
