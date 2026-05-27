"""Shared Gemini client for worker-side agents.

Two backends, picked at runtime:
  - HTTP API     (preferred — set GEMINI_API_KEY)
  - Browser controller (fallback — needs AI Studio selectors calibrated +
    a captured storage_state.json)

The HTTP path uses urllib (stdlib only — no new dep). Free tier on
gemini-2.5-flash is generous (~1500 req/day) which is plenty for the
UTEONT pipeline.

Get an API key at https://aistudio.google.com/app/apikey
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

log = logging.getLogger("agents.gemini")

API_BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-2.5-flash"

THINKING_LEVELS = {
    "low":    {"temperature": 1.0, "maxOutputTokens": 4096},
    "medium": {"temperature": 1.0, "maxOutputTokens": 8192},
    "high":   {"temperature": 1.0, "maxOutputTokens": 16384},
}


class GeminiError(Exception):
    pass


def has_api_key() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def complete(
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    thinking_level: str = "medium",
    system: str | None = None,
    timeout: int = 120,
) -> str:
    """Call the Gemini HTTP API with the given prompt. Returns the response text.

    Raises GeminiError on failure. Caller decides whether to fall back to
    browser automation or surface the error.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise GeminiError(
            "GEMINI_API_KEY not set. Get one free at "
            "https://aistudio.google.com/app/apikey and add it as a Railway "
            "env var on the worker service."
        )

    params = THINKING_LEVELS.get(thinking_level, THINKING_LEVELS["medium"])
    url = f"{API_BASE}/models/{model}:generateContent?key={urllib.parse.quote(api_key)}"

    contents = [{"role": "user", "parts": [{"text": prompt}]}]
    body: dict = {
        "contents": contents,
        "generationConfig": params,
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = ""
        try:
            err_body = e.read().decode("utf-8")
        except Exception:
            pass
        raise GeminiError(f"HTTP {e.code}: {err_body[:500]}") from e
    except urllib.error.URLError as e:
        raise GeminiError(f"network error: {e}") from e

    candidates = payload.get("candidates") or []
    if not candidates:
        raise GeminiError(f"no candidates in response: {payload}")
    parts = candidates[0].get("content", {}).get("parts") or []
    text_pieces = [p.get("text", "") for p in parts if "text" in p]
    text = "".join(text_pieces).strip()
    if not text:
        raise GeminiError(f"empty text in response: {payload}")
    return text


def complete_json(
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    thinking_level: str = "low",
    system: str | None = None,
) -> dict | list:
    """Same as complete() but expects valid JSON in the response.

    Strips common LLM artifacts (markdown fences). Raises if JSON can't be
    extracted.
    """
    raw = complete(prompt, model=model, thinking_level=thinking_level, system=system)
    cleaned = _strip_code_fence(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        # Try to find a JSON substring
        start = min(
            (cleaned.find(c) for c in "[{" if cleaned.find(c) != -1),
            default=-1,
        )
        if start >= 0:
            # Find balanced end
            for end_char in "]}":
                end = cleaned.rfind(end_char)
                if end > start:
                    try:
                        return json.loads(cleaned[start : end + 1])
                    except json.JSONDecodeError:
                        continue
        raise GeminiError(
            f"could not parse JSON from response: {e} — raw start: {raw[:200]!r}"
        ) from e


def _strip_code_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        # remove first line (```json or ```)
        nl = t.find("\n")
        if nl != -1:
            t = t[nl + 1 :]
        if t.endswith("```"):
            t = t[: -3]
    return t.strip()
