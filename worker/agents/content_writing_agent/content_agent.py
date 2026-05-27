"""Content Writing Agent — given an idea (title + brief), draft a full article.

Output:
  {
    "title":       "...",
    "slug":        "kebab-case-from-title",
    "body":        "<markdown body>",
    "wordCount":   1234,
    "metaTitle":   "<60 chars>",
    "metaDescription": "<155 chars>"
  }
"""

from __future__ import annotations

import logging
import re
from typing import Callable

from agents._gemini import complete

log = logging.getLogger("agents.content_writing")

ProgressFn = Callable[[str], None]


def _no_progress(_msg: str) -> None:
    pass


SYSTEM_PROMPT = (
    "You write clear, helpful articles for an audience that wants actionable "
    "advice. You avoid filler, marketing fluff, and generic openings. You "
    "structure articles with proper H1/H2/H3 headings. You output Markdown only."
)


def _build_prompt(title: str, brief: str, target_keyword: str | None,
                  word_target: int, intent: str | None) -> str:
    intent_line = f"Search intent: {intent}\n" if intent else ""
    kw_line = f"Target keyword: {target_keyword}\n" if target_keyword else ""
    return f"""Write a complete article in Markdown.

Title (use as H1): {title}
Brief: {brief}
{kw_line}{intent_line}Target length: ~{word_target} words

Requirements:
- Start with the H1 (# Title)
- Use H2 (##) for sections, H3 (###) for sub-sections
- Open with a tight, helpful intro — no filler
- Avoid marketing language ("game-changing", "revolutionary", etc.)
- Include specifics, examples, concrete recommendations
- End with a short conclusion

Output the article as Markdown. Do NOT wrap in code fences.
"""


def _slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")[:60] or "article"


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[A-Za-z']+\b", text))


def _first_paragraph(text: str) -> str:
    # Skip the H1, return first non-heading paragraph
    for block in text.split("\n\n"):
        b = block.strip()
        if not b or b.startswith("#"):
            continue
        return b.replace("\n", " ").strip()
    return ""


def write(
    title: str,
    brief: str,
    target_keyword: str | None = None,
    word_target: int = 1200,
    intent: str | None = None,
    progress: ProgressFn = _no_progress,
) -> dict:
    if not title or not brief:
        raise ValueError("content-writing requires both 'title' and 'brief'")

    progress(f"drafting ~{word_target}w article: {title[:60]!r}")
    body = complete(
        _build_prompt(title, brief, target_keyword, word_target, intent),
        thinking_level="medium",
        system=SYSTEM_PROMPT,
    )
    body = body.strip()

    # Ensure H1 present
    if not body.startswith("# "):
        body = f"# {title}\n\n{body}"

    wc = _word_count(body)
    first_para = _first_paragraph(body)
    meta_desc = (first_para[:152] + "...") if len(first_para) > 155 else first_para
    meta_title = title if len(title) <= 60 else (title[:57] + "...")

    progress(f"draft: {wc} words")
    return {
        "title": title,
        "slug": _slugify(title),
        "body": body,
        "wordCount": wc,
        "metaTitle": meta_title,
        "metaDescription": meta_desc,
    }
