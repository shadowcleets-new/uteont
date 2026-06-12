"""Tactics Scraper Agent — main entrypoint.

Scrapes marketing/SEO communities and returns distilled tactic rows:
    {"tactics": [{"sourceUrl","sourceType","title","body","tags","score"}], "count": N}

Strategies, all free / no paid APIs:
  - reddit  → PRAW (read-only) when REDDIT_CLIENT_ID/SECRET are set; else skipped
  - hn      → the public Algolia HN Search API (no key)
  - forum/blog/x/other → a lightweight HTML fetch + title/paragraph extraction

Programmatic (used by the worker handler):
    from agents.tactics_scraper_agent.tactics_agent import scrape
    result = scrape(sources=["https://www.reddit.com/r/SEO/"], progress=print)

Each source degrades gracefully — one source failing never aborts the run.
"""

from __future__ import annotations

import html
import json
import logging
import re
import urllib.parse
import urllib.request
from typing import Callable

from agents.tactics_scraper_agent.sources import (
    DEFAULT_SOURCES,
    classify_source,
    subreddit_of,
)

log = logging.getLogger("agents.tactics")

ProgressFn = Callable[[str], None]

_UA = "uteont-tactics-scraper/0.1 (+https://uteont.vercel.app)"
_PER_SOURCE_LIMIT = 15
_BODY_MAX = 4000


def _no_progress(_msg: str) -> None:
    pass


def _http_get(url: str, timeout: int = 15) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed UA, operator URL)
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def _strip_html(raw: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


# --- per-source-type scrapers -------------------------------------------------

def _scrape_reddit(url: str, progress: ProgressFn) -> list[dict]:
    import os

    sub = subreddit_of(url) or "SEO"
    cid, csec = os.environ.get("REDDIT_CLIENT_ID"), os.environ.get("REDDIT_CLIENT_SECRET")
    if not (cid and csec):
        progress(f"reddit r/{sub}: skipped (no REDDIT_CLIENT_ID/SECRET)")
        return []
    try:
        import praw  # lazy
    except ImportError:
        progress("reddit: praw not installed — skipping")
        return []
    try:
        reddit = praw.Reddit(
            client_id=cid,
            client_secret=csec,
            user_agent=os.environ.get("REDDIT_USER_AGENT", _UA),
        )
        reddit.read_only = True
        out: list[dict] = []
        for s in reddit.subreddit(sub).hot(limit=_PER_SOURCE_LIMIT):
            title = (getattr(s, "title", "") or "").strip()
            if not title:
                continue
            body = (getattr(s, "selftext", "") or "").strip()[:_BODY_MAX] or title
            out.append({
                "sourceUrl": f"https://www.reddit.com{getattr(s, 'permalink', '')}",
                "sourceType": "reddit",
                "title": title[:300],
                "body": body,
                "tags": [f"r/{sub}"],
                "score": float(max(0, int(getattr(s, "score", 0) or 0))),
            })
        progress(f"reddit r/{sub}: {len(out)} posts")
        return out
    except Exception as e:  # noqa: BLE001
        progress(f"reddit r/{sub} failed: {e}")
        return []


def _scrape_hn(progress: ProgressFn) -> list[dict]:
    # Public Algolia HN Search API — front-page-ranked stories about SEO/marketing.
    api = (
        "https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage="
        f"{_PER_SOURCE_LIMIT}&query=" + urllib.parse.quote("SEO marketing growth")
    )
    try:
        data = json.loads(_http_get(api))
    except Exception as e:  # noqa: BLE001
        progress(f"hn failed: {e}")
        return []
    out: list[dict] = []
    for hit in data.get("hits", []):
        title = (hit.get("title") or "").strip()
        if not title:
            continue
        obj_id = hit.get("objectID")
        out.append({
            "sourceUrl": hit.get("url") or f"https://news.ycombinator.com/item?id={obj_id}",
            "sourceType": "hn",
            "title": title[:300],
            "body": (hit.get("story_text") or title)[:_BODY_MAX],
            "tags": ["hackernews"],
            "score": float(hit.get("points") or 0),
        })
    progress(f"hn: {len(out)} stories")
    return out


def _scrape_html(url: str, source_type: str, progress: ProgressFn) -> list[dict]:
    try:
        raw = _http_get(url)
    except Exception as e:  # noqa: BLE001
        progress(f"{source_type} {url} failed: {e}")
        return []
    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw)
    title = _strip_html(m.group(1)) if m else url
    body = _strip_html(raw)[:_BODY_MAX]
    if not body:
        return []
    progress(f"{source_type}: scraped {url}")
    return [{
        "sourceUrl": url,
        "sourceType": source_type,
        "title": title[:300],
        "body": body,
        "tags": [source_type],
        "score": None,
    }]


def scrape(sources: list[str] | None = None, progress: ProgressFn | None = None) -> dict:
    progress = progress or _no_progress
    urls = [u.strip() for u in (sources or DEFAULT_SOURCES) if u and u.strip()]
    tactics: list[dict] = []
    for url in urls:
        stype = classify_source(url)
        if stype == "reddit":
            tactics.extend(_scrape_reddit(url, progress))
        elif stype == "hn":
            tactics.extend(_scrape_hn(progress))
        else:
            tactics.extend(_scrape_html(url, stype, progress))
    progress(f"tactics: {len(tactics)} total from {len(urls)} source(s)")
    return {"tactics": tactics, "count": len(tactics)}
