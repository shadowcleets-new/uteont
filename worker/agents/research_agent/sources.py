"""Keyword discovery sources.

Each source returns a list[RawSignal]. Sources fail independently — if one
errors, the agent continues with whatever the others produced.

Sources:
- TrendsSource    — Google Trends via pytrends (no API key)
- WikipediaSource — MediaWiki search API via urllib (no key)
- RedditSource    — Reddit via PRAW (requires creds; skips itself if missing)
"""

from __future__ import annotations

import json
import logging
import time
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from typing import Iterable

from agents.research_agent.config import Config
from agents.research_agent.models import RawSignal

log = logging.getLogger("agents.research.sources")


class SourceBase(ABC):
    name: str

    @abstractmethod
    def discover(self, seed: str) -> list[RawSignal]: ...


# --- Google Trends -------------------------------------------------------

class TrendsSource(SourceBase):
    name = "trends"

    def discover(self, seed: str) -> list[RawSignal]:
        # Lazy import — pytrends pulls pandas which is heavy
        from pytrends.request import TrendReq

        tr = TrendReq(hl="en-US", tz=360, timeout=(5, 20))
        try:
            tr.build_payload([seed], timeframe="today 12-m", geo="")
        except Exception as e:
            log.warning("trends.build_payload failed for '%s': %s", seed, e)
            return []

        signals: list[RawSignal] = []
        try:
            related = tr.related_queries() or {}
        except Exception as e:
            log.warning("trends.related_queries failed for '%s': %s", seed, e)
            related = {}

        seed_block = related.get(seed) or {}
        for bucket_name, source_label in (("top", "trends_top"), ("rising", "trends_rising")):
            df = seed_block.get(bucket_name)
            if df is None or df.empty:
                continue
            for row in df.itertuples(index=False):
                query = getattr(row, "query", None)
                value = getattr(row, "value", 0)
                if not query:
                    continue
                # Rising values can exceed 100 ("breakout"); clamp
                try:
                    interest = min(100.0, float(value))
                except (TypeError, ValueError):
                    interest = 50.0
                signals.append(RawSignal(
                    keyword=str(query),
                    interest=interest,
                    source=source_label,
                    metadata={"seed": seed},
                ))
        log.info("trends: %d signals for seed '%s'", len(signals), seed)
        return signals


# --- Wikipedia -----------------------------------------------------------

class WikipediaSource(SourceBase):
    name = "wikipedia"
    SEARCH_URL = "https://en.wikipedia.org/w/api.php"

    def discover(self, seed: str) -> list[RawSignal]:
        params = {
            "action": "opensearch",
            "search": seed,
            "limit": "15",
            "format": "json",
        }
        url = f"{self.SEARCH_URL}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": "dna-seo-research/0.1"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.loads(r.read().decode("utf-8"))
        except Exception as e:
            log.warning("wikipedia search failed for '%s': %s", seed, e)
            return []

        titles: Iterable[str] = data[1] if isinstance(data, list) and len(data) > 1 else []
        signals = []
        for i, title in enumerate(titles):
            if not title or title.lower() == seed.lower():
                continue
            # Decay interest with rank position (top hit = 70, decays)
            interest = max(30.0, 70.0 - (i * 3))
            signals.append(RawSignal(
                keyword=str(title),
                interest=interest,
                source="wikipedia",
                metadata={"seed": seed, "rank": i},
            ))
        log.info("wikipedia: %d signals for seed '%s'", len(signals), seed)
        return signals


# --- Reddit (PRAW) -------------------------------------------------------

class RedditSource(SourceBase):
    name = "reddit"

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def discover(self, seed: str) -> list[RawSignal]:
        if not self.cfg.reddit_enabled():
            log.info("reddit: skipped (no credentials)")
            return []
        try:
            import praw  # lazy
        except ImportError:
            log.warning("reddit: praw not installed — skipping")
            return []

        try:
            reddit = praw.Reddit(
                client_id=self.cfg.reddit_client_id,
                client_secret=self.cfg.reddit_client_secret,
                user_agent=self.cfg.reddit_user_agent,
            )
            reddit.read_only = True
        except Exception as e:
            log.warning("reddit auth failed: %s", e)
            return []

        signals: list[RawSignal] = []
        try:
            for submission in reddit.subreddit("all").search(
                seed, limit=20, sort="relevance", time_filter="month"
            ):
                title = (submission.title or "").strip()
                if not title:
                    continue
                score = max(0, int(getattr(submission, "score", 0) or 0))
                # Map upvotes to 0-100 interest (log-ish curve)
                interest = min(100.0, 20.0 + (score ** 0.5))
                signals.append(RawSignal(
                    keyword=title[:120],
                    interest=interest,
                    source="reddit",
                    metadata={
                        "seed": seed,
                        "subreddit": str(submission.subreddit),
                        "score": score,
                        "url": getattr(submission, "url", ""),
                    },
                ))
        except Exception as e:
            log.warning("reddit search failed for '%s': %s", seed, e)
            return signals

        log.info("reddit: %d signals for seed '%s'", len(signals), seed)
        # Be polite — small pause between seeds
        time.sleep(0.5)
        return signals


def all_sources(cfg: Config) -> list[SourceBase]:
    return [TrendsSource(), WikipediaSource(), RedditSource(cfg)]
