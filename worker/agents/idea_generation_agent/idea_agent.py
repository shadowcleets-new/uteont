"""Idea Generation Agent — given a list of keywords, produce article angles.

Output schema (list of dicts):
[
  {
    "keyword": "<the input keyword>",
    "angle":   "<a specific article angle title>",
    "brief":   "<2-3 sentence brief>",
    "intent":  "informational" | "commercial" | "transactional" | "navigational"
  },
  ...
]
"""

from __future__ import annotations

import json
import logging
from typing import Callable

from agents._gemini import complete_json

log = logging.getLogger("agents.idea_generation")

ProgressFn = Callable[[str], None]


def _no_progress(_msg: str) -> None:
    pass


SYSTEM_PROMPT = (
    "You are an experienced SEO content strategist. Given a list of keywords, "
    "you propose article angles that real users would search for. You favor "
    "concrete, specific angles over generic ones. You output strict JSON only."
)


def _build_prompt(keywords: list[str], n_per_keyword: int) -> str:
    return f"""For each of these {len(keywords)} keywords, propose {n_per_keyword} distinct article angles.

Each angle must be:
- Specific (not generic), 50-80 characters
- Different from the others for the same keyword
- Reflective of real searcher intent

Output ONLY a JSON array. Each element:
{{
  "keyword": "<exact keyword as given>",
  "angle": "<the article title>",
  "brief": "<2-3 sentences on scope and main points>",
  "intent": "informational" | "commercial" | "transactional" | "navigational"
}}

Keywords:
{json.dumps(keywords, indent=2)}
"""


def generate(
    keywords: list[str],
    n_per_keyword: int = 5,
    progress: ProgressFn = _no_progress,
) -> dict:
    if not keywords:
        raise ValueError("idea-generation requires non-empty 'keywords' list")
    keywords = [str(k).strip() for k in keywords if str(k).strip()]
    if not keywords:
        raise ValueError("idea-generation: keywords list empty after stripping")

    progress(f"requesting {n_per_keyword} angles for {len(keywords)} keyword(s)")
    parsed = complete_json(
        _build_prompt(keywords, n_per_keyword),
        thinking_level="low",
        system=SYSTEM_PROMPT,
    )

    if not isinstance(parsed, list):
        raise ValueError(f"expected JSON array, got {type(parsed).__name__}")

    valid: list[dict] = []
    for it in parsed:
        if not isinstance(it, dict):
            continue
        kw = str(it.get("keyword", "")).strip()
        angle = str(it.get("angle", "")).strip()
        brief = str(it.get("brief", "")).strip()
        intent = str(it.get("intent", "informational")).strip().lower()
        if not (kw and angle and brief):
            continue
        if intent not in {"informational", "commercial", "transactional", "navigational"}:
            intent = "informational"
        valid.append({"keyword": kw, "angle": angle, "brief": brief, "intent": intent})

    progress(f"parsed {len(valid)} valid ideas")
    return {
        "ideas": valid,
        "idea_count": len(valid),
        "keywords_in": keywords,
        "n_per_keyword": n_per_keyword,
    }
