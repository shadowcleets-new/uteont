"""
@file parse.py
@description Pure-stdlib SERP HTML parser. Turns a simplified search-results
             HTML document into an ordered list of result dicts. No third-party
             dependencies (no bs4) — uses html.parser + html.unescape only.

[TABLE OF CONTENTS]
1. IMPORTS & DEPENDENCIES
2. MARKUP CONVENTION (the contract the parser expects)
3. LOCAL CONSTANTS & CONFIG
4. MAIN EXPORT: parse_serp_html
5. STATE LIFECYCLE: _SerpHtmlParser (html.parser subclass)
6. HELPER UTILITIES
"""

# #region 1. Imports & Dependencies
from __future__ import annotations

import logging
from html import unescape
from html.parser import HTMLParser
# #endregion

# #region 2. Markup Convention
# The parser is built around one explicit, documented container convention.
# Each search result is a single element carrying class "result":
#
#   <div class="result">
#     <a class="result-url" href="<URL>"><TITLE></a>
#     <p class="result-snippet"><SNIPPET></p>
#   </div>
#
# Rules:
#   * "rank" is the document order of the result containers, starting at 1.
#   * The url is the href of the <a class="result-url">; the title is that
#     anchor's text. The snippet is the text of <p class="result-snippet">.
#   * HTML entities in title/snippet are decoded (e.g. &amp; -> &).
#   * Class attributes are matched token-wise, so extra classes are tolerated
#     (class="result featured" still counts as a result container).
#   * Missing pieces degrade gracefully: a result with no url is dropped; a
#     missing title/snippet becomes an empty string.
# #endregion

# #region 3. Local Constants & Config
logger = logging.getLogger(__name__)

_RESULT_CLASS = "result"
_URL_CLASS = "result-url"
_SNIPPET_CLASS = "result-snippet"
# #endregion


# #region 4. Main Export: parse_serp_html
def parse_serp_html(html: str) -> list[dict]:
    """Parse simplified SERP HTML into ordered result dicts.

    Args:
        html: Raw HTML string following the documented result convention.

    Returns:
        A list of {"rank", "url", "title", "snippet"} dicts in document order
        (rank starts at 1). Returns [] for empty, non-string, or malformed
        input — callers never see an exception from a bad payload.
    """
    if not isinstance(html, str):
        return []
    if not html.strip():
        return []

    parser = _SerpHtmlParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:  # pragma: no cover - html.parser is very forgiving
        # Defensive: never surface parser internals to the caller. Log detail
        # server-side and return whatever well-formed results we gathered.
        logger.exception("SERP HTML parse failed")

    results: list[dict] = []
    for rank, raw in enumerate(parser.records, start=1):
        url = raw.get("url", "").strip()
        if not url:
            # A result with no URL is not actionable — skip it but do not let
            # the gap shift ranks; re-rank contiguously below.
            continue
        results.append({
            "rank": rank,
            "url": url,
            "title": _clean(raw.get("title", "")),
            "snippet": _clean(raw.get("snippet", "")),
        })

    # Re-rank contiguously in case any url-less container was skipped.
    for i, rec in enumerate(results, start=1):
        rec["rank"] = i

    return results
# #endregion


# #region 5. State Lifecycle: _SerpHtmlParser
class _SerpHtmlParser(HTMLParser):
    """Streaming SGML walker that collects one record per result container."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.records: list[dict] = []
        self._depth = 0            # nesting depth inside the active result
        self._current: dict | None = None
        self._capture: str | None = None  # "title" | "snippet" | None

    # -- tag entry --------------------------------------------------------
    def handle_starttag(self, tag: str, attrs) -> None:
        classes = _classes(attrs)

        if _RESULT_CLASS in classes:
            # Open (or, for nested results, just deepen) a result container.
            if self._current is None:
                self._current = {"url": "", "title": "", "snippet": ""}
                self._depth = 1
            else:
                self._depth += 1
            return

        if self._current is None:
            return  # ignore everything outside a result container
        self._depth += 1

        if tag == "a" and _URL_CLASS in classes:
            self._current["url"] = _attr(attrs, "href")
            self._capture = "title"
        elif _SNIPPET_CLASS in classes:
            self._capture = "snippet"

    # -- text -------------------------------------------------------------
    def handle_data(self, data: str) -> None:
        if self._current is not None and self._capture is not None:
            self._current[self._capture] += data

    # -- tag exit ---------------------------------------------------------
    def handle_endtag(self, tag: str) -> None:
        if self._current is None:
            return
        # Closing any tag inside the container also ends an active capture.
        if self._capture is not None:
            self._capture = None
        self._depth -= 1
        if self._depth <= 0:
            self.records.append(self._current)
            self._current = None
            self._depth = 0
# #endregion


# #region 6. Helper Utilities
def _classes(attrs) -> set[str]:
    """Return the token-wise set of class names for an attr list."""
    raw = _attr(attrs, "class")
    return set(raw.split()) if raw else set()


def _attr(attrs, name: str) -> str:
    """Fetch a named attribute's value from html.parser's (k, v) list."""
    for key, val in attrs:
        if key == name:
            return val or ""
    return ""


def _clean(text: str) -> str:
    """Unescape entities and collapse surrounding/internal whitespace."""
    return " ".join(unescape(text).split())
# #endregion
