"""Source classification + defaults for the Tactics Scraper.

A "source" is any URL the operator pastes (a subreddit, an HN front page, a
blog, a forum, an X account/post) — or, when none is given, the six default
communities. classify_source maps a URL to one of the tactics.source_type
enum values so the scraper picks the right fetch strategy.
"""

from __future__ import annotations

import urllib.parse

# The tactics.source_type enum (mirrors src/lib/db/schema.ts).
SOURCE_TYPES = ("reddit", "hn", "forum", "blog", "x", "other", "notebooklm-derived")

# Default communities scraped when the operator gives no explicit source.
DEFAULT_SOURCES = [
    "https://www.reddit.com/r/SEO/",
    "https://www.reddit.com/r/bigseo/",
    "https://www.reddit.com/r/marketing/",
    "https://www.reddit.com/r/TechSEO/",
    "https://news.ycombinator.com/",
    "https://support.google.com/webmasters/community",
]


def classify_source(url: str) -> str:
    """Return the tactics.source_type for a URL (best-effort, never raises)."""
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception:
        return "other"
    if "reddit.com" in host:
        return "reddit"
    if "news.ycombinator.com" in host or host == "hn.algolia.com":
        return "hn"
    if host in ("x.com", "twitter.com") or host.endswith(".x.com"):
        return "x"
    if "support.google.com" in host or "forum" in host or "community" in url:
        return "forum"
    if host:
        return "blog"
    return "other"


def subreddit_of(url: str) -> str | None:
    """Extract the subreddit name from a reddit URL, or None."""
    try:
        parts = [p for p in urllib.parse.urlparse(url).path.split("/") if p]
        if len(parts) >= 2 and parts[0].lower() == "r":
            return parts[1]
    except Exception:
        return None
    return None
