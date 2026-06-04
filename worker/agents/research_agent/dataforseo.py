"""DataForSEO source helpers — real keyword volume + competition (paid, optional).

Uses DataForSEO Labs 'Keyword Suggestions' (live) to expand a seed into
long-tail keywords carrying REAL search_volume, competition, cpc, and a 12-month
trend. Pure parsing lives here (unit-tested); `fetch` does the HTTP. stdlib only
(urllib) — no extra dependency. The Source wrapper lives in sources.py and skips
itself when credentials are absent.
"""

from __future__ import annotations

import base64
import json
import logging
import math
import urllib.request

from agents.research_agent.models import RawSignal

log = logging.getLogger("agents.research.dataforseo")

ENDPOINT = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live"


def _volume_to_interest(volume) -> float:
    """Map an absolute monthly search volume to a 0-100 interest (log scale)."""
    try:
        v = max(0, int(volume or 0))
    except (TypeError, ValueError):
        v = 0
    return max(1.0, min(100.0, math.log10(v + 1) * 20.0))


def _trend_ratio(monthly_searches) -> float:
    """Recent-3-month vs prior-3-month volume ratio (>1 = rising). 1.0 if unknown.

    DataForSEO returns `monthly_searches` most-recent-first; we compare the first
    three months against the next three. Capped at 5.0 to tame 'breakout' noise.
    """
    if not monthly_searches or len(monthly_searches) < 6:
        return 1.0

    def sv(x) -> float:
        try:
            return float(x.get("search_volume") or 0)
        except (AttributeError, TypeError, ValueError):
            return 0.0

    recent = sum(sv(m) for m in monthly_searches[:3]) / 3.0
    prior = sum(sv(m) for m in monthly_searches[3:6]) / 3.0
    if prior <= 0:
        return 1.0 if recent <= 0 else 5.0
    return round(min(5.0, recent / prior), 2)


def parse_keyword_suggestions(response: dict, seed: str) -> list[RawSignal]:
    """Pure: DataForSEO keyword_suggestions response -> RawSignals.

    Real metrics (search_volume, competition, cpc, trend_ratio) ride in metadata
    so scoring can use them verbatim instead of estimating. Tolerant of any
    malformed/empty shape -> returns [].
    """
    try:
        tasks = response.get("tasks") or []
        result = (tasks[0].get("result") if tasks else None) or []
        items = (result[0].get("items") if result else None) or []
    except (AttributeError, IndexError, TypeError):
        return []

    signals: list[RawSignal] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        keyword = (item.get("keyword") or "").strip()
        if not keyword:
            continue
        info = item.get("keyword_info") or {}
        try:
            volume = int(info.get("search_volume") or 0)
        except (TypeError, ValueError):
            volume = 0
        competition = info.get("competition")
        try:
            competition = float(competition) if competition is not None else None
        except (TypeError, ValueError):
            competition = None
        trend = _trend_ratio(info.get("monthly_searches"))
        interest = _volume_to_interest(volume)
        if trend > 1.2:  # rising terms get a small nudge so 'trending' surfaces
            interest = min(100.0, interest + 5.0)
        signals.append(RawSignal(
            keyword=keyword,
            interest=interest,
            source="dataforseo",
            metadata={
                "seed": seed,
                "search_volume": volume,
                "competition": competition,
                "cpc": info.get("cpc"),
                "trend_ratio": trend,
            },
        ))
    return signals


def fetch(
    login: str,
    password: str,
    seed: str,
    location_code: int = 2840,
    language_code: str = "en",
    limit: int = 30,
    timeout: int = 30,
) -> dict:
    """POST one keyword_suggestions task (live) and return the parsed JSON dict.

    Raises on network/HTTP error — the caller (DataForSeoSource) swallows it so a
    DataForSEO outage never breaks the whole research run.
    """
    body = json.dumps([{
        "keyword": seed,
        "language_code": language_code,
        "location_code": location_code,
        "limit": limit,
        "include_serp_info": False,
    }]).encode("utf-8")
    token = base64.b64encode(f"{login}:{password}".encode("utf-8")).decode("ascii")
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read().decode("utf-8"))
    # Surface API-level errors (e.g. 40100 auth) in the log without crashing.
    try:
        status = data.get("tasks", [{}])[0].get("status_code")
        if status and status != 20000:
            log.warning("dataforseo task status %s: %s", status,
                        data["tasks"][0].get("status_message"))
    except (AttributeError, IndexError, TypeError):
        pass
    return data
