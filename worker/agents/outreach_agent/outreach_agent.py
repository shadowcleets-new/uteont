"""Outreach Drafting Agent — draft a personalized outreach email.

NEVER sends. Output is a draft for human review.

Output:
  {
    "subject": "...",
    "body":    "<plain-text email body>",
    "tone":    "professional" | "casual" | "warm",
    "context": "..."   # the inferred reason for outreach (for logging)
  }
"""

from __future__ import annotations

import logging
from typing import Callable

from agents._gemini import complete_json

log = logging.getLogger("agents.outreach")

ProgressFn = Callable[[str], None]


def _no_progress(_msg: str) -> None:
    pass


SYSTEM_PROMPT = (
    "You draft outreach emails for link-building and partnership conversations. "
    "Your style is concrete, low-pressure, and respectful of the recipient's time. "
    "You NEVER fabricate facts about the recipient — if context is sparse, you "
    "keep claims general. You output strict JSON."
)


def _build_prompt(
    target_site: str,
    target_email: str | None,
    context: str,
    our_article_url: str | None,
    our_value: str,
    tone: str,
) -> str:
    return f"""Draft a single outreach email.

Recipient site:  {target_site}
Recipient email: {target_email or "(unknown)"}
Tone:            {tone}
Context (about the recipient): {context}

Our value proposition (what we offer or want to discuss):
{our_value}

Our article (if relevant): {our_article_url or "(none)"}

Rules:
- 60-130 words total in the body
- Subject under 50 characters
- One specific reason this recipient matters
- One clear, low-pressure ask
- No "I hope this email finds you well" or similar fluff
- No bold claims about the recipient that aren't grounded in the context

Output strict JSON:
{{
  "subject": "<subject line>",
  "body":    "<email body — plain text, no signature>",
  "tone":    "{tone}",
  "context": "<one sentence on why this recipient was picked>"
}}
"""


def draft(
    target_site: str,
    context: str,
    our_value: str,
    target_email: str | None = None,
    our_article_url: str | None = None,
    tone: str = "professional",
    progress: ProgressFn = _no_progress,
) -> dict:
    if not target_site:
        raise ValueError("outreach requires 'targetSite'")
    if not context:
        raise ValueError("outreach requires 'context' (background on the recipient)")
    if not our_value:
        raise ValueError("outreach requires 'ourValue' (what we offer)")

    progress(f"drafting outreach email to {target_site}")
    parsed = complete_json(
        _build_prompt(target_site, target_email, context, our_article_url, our_value, tone),
        thinking_level="low",
        system=SYSTEM_PROMPT,
    )
    if not isinstance(parsed, dict):
        raise ValueError(f"expected JSON object, got {type(parsed).__name__}")
    subject = str(parsed.get("subject", "")).strip()
    body = str(parsed.get("body", "")).strip()
    if not subject or not body:
        raise ValueError("outreach LLM returned empty subject or body")

    return {
        "subject": subject,
        "body": body,
        "tone": str(parsed.get("tone", tone)),
        "context": str(parsed.get("context", "")),
        "target_site": target_site,
        "target_email": target_email,
    }
