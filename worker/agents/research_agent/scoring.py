"""Scoring & ranking — merges raw signals into final KeywordResult list.

Heuristics (free-tool world; no paid SERP intelligence):
- search_volume_estimate: max interest across sources, scaled to a rough number
- competition_score:      derived from which source classes surfaced the keyword
                          (established sources → higher competition)
- priority_rank:          1-based rank by composite score = volume * (1 - 0.6 * competition)

Self-improvement loop: optionally reads performance.json (frozen contract) and
applies cluster-level boosts / penalties. Tolerant of nulls — no signal yet
must NOT cause deprioritization.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from agents.research_agent.models import KeywordResult, RawSignal

log = logging.getLogger("agents.research.scoring")


# Base competition score per source class.
# Lower = newer / less saturated; higher = more established.
SOURCE_COMPETITION = {
    "trends_rising": 0.25,    # rising = opportunity
    "trends_top":    0.65,    # already popular
    "wikipedia":     0.55,    # established topic
    "reddit":        0.40,    # active discussion, varies
}

# Volume multiplier — interest (0-100) * this = rough search_volume_estimate.
# Deliberately rough; this is a comparative ranking, not an absolute prediction.
VOLUME_MULTIPLIER = 100


def _normalize_keyword(raw: str) -> str:
    return " ".join(raw.lower().strip().split())


def merge_signals(signals: list[RawSignal]) -> dict[str, list[RawSignal]]:
    by_kw: dict[str, list[RawSignal]] = defaultdict(list)
    for s in signals:
        kw = _normalize_keyword(s.keyword)
        if not kw or len(kw) < 3:
            continue
        # Drop the seed itself — we want new candidates
        seed = (s.metadata or {}).get("seed", "")
        if kw == _normalize_keyword(str(seed)):
            continue
        by_kw[kw].append(s)
    return by_kw


def score_keyword(signals: list[RawSignal]) -> tuple[int, float, str]:
    """Return (volume_estimate, competition_score, source_label)."""
    max_interest = max((s.interest for s in signals), default=0.0)
    sources = sorted({s.source for s in signals})
    # Competition: average of per-source competitions for sources that surfaced this
    if sources:
        per_source = [SOURCE_COMPETITION.get(s, 0.5) for s in sources]
        competition = sum(per_source) / len(per_source)
        # Multi-source bonus to competition (more sources = more established)
        if len(sources) > 1:
            competition = min(1.0, competition + 0.05 * (len(sources) - 1))
    else:
        competition = 0.5
    volume_est = int(max_interest * VOLUME_MULTIPLIER)
    return volume_est, round(competition, 3), "+".join(sources)


def apply_performance_feedback(
    results: list[KeywordResult], performance_path: Path
) -> list[KeywordResult]:
    """Adjust competition scores based on past performance.

    Null-tolerant: if a cluster has no signal, no adjustment is applied.
    """
    if not performance_path.exists():
        return results
    try:
        data = json.loads(performance_path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning("could not read performance.json: %s", e)
        return results

    clusters = {c["cluster_id"]: c for c in data.get("cluster_aggregates", [])}
    if not clusters:
        return results

    # Simple heuristic: if a keyword's cluster has 3+ failed-to-rank articles,
    # bump competition (penalty); if it's rising, slight discount.
    for r in results:
        # Match by substring against cluster_id (no formal clustering yet)
        for cid, agg in clusters.items():
            if cid.lower() in r.keyword.lower():
                failed = agg.get("articles_failed_to_rank_90d") or 0
                trend = agg.get("trend") or "unknown"
                if failed >= 3:
                    r.competition_score = min(1.0, r.competition_score + 0.15)
                if trend == "rising":
                    r.competition_score = max(0.0, r.competition_score - 0.10)
                r.competition_score = round(r.competition_score, 3)
                break
    return results


def merge_and_rank(
    signals: list[RawSignal],
    performance_path: Path | None = None,
    max_results: int = 50,
) -> list[KeywordResult]:
    grouped = merge_signals(signals)
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")

    results: list[KeywordResult] = []
    for kw, sigs in grouped.items():
        volume, competition, source_label = score_keyword(sigs)
        results.append(KeywordResult(
            keyword=kw,
            search_volume_estimate=volume,
            competition_score=competition,
            source=source_label,
            timestamp=timestamp,
            priority_rank=0,
        ))

    if performance_path is not None:
        results = apply_performance_feedback(results, performance_path)

    # Composite score — favor high volume, penalize competition modestly
    results.sort(
        key=lambda r: r.search_volume_estimate * (1.0 - 0.6 * r.competition_score),
        reverse=True,
    )
    results = results[:max_results]
    for i, r in enumerate(results, start=1):
        r.priority_rank = i
    return results
