"""Scoring & ranking — merges raw signals into final KeywordResult list.

Heuristics (free-tool world; no paid SERP intelligence):
- search_volume_estimate: max interest across sources, scaled to a rough number
- competition_score:      derived from which source classes surfaced the keyword
                          (established sources → higher competition)
- priority_rank:          1-based rank by composite score = volume * (1 - 0.6 * competition)

Self-improvement loop: optionally reads performance.json (frozen contract) and
applies cluster-level boosts / penalties. Tolerant of nulls — no signal yet
must NOT cause deprioritization.

Relevance + noise filtering — applied to RawSignals BEFORE merging:
- Drops keywords that share no significant word with any seed
- Drops noise phrases ("news today", "near me", branded geo terms, etc.)
- Length sanity (4-100 chars, >= 1 alphabetic token)
"""

from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from agents.research_agent.models import KeywordResult, RawSignal

log = logging.getLogger("agents.research.scoring")

# Short tokens that don't contribute to relevance matching.
STOPWORDS = {
    "a", "an", "the", "of", "for", "to", "in", "on", "at", "and", "or",
    "is", "are", "was", "were", "be", "been", "by", "with", "as", "it",
    "this", "that", "these", "those", "from", "up", "down", "out",
    # very short common technical terms — keep "ai", "ml" though (caller can re-add)
    "vs", "i", "we", "you", "your", "my", "our",
}

# Patterns that almost always indicate noise / irrelevance.
NOISE_PATTERNS = [
    re.compile(r"\bnews\s+today\b", re.IGNORECASE),
    re.compile(r"\bnear\s+me\b", re.IGNORECASE),
    re.compile(r"\bcheap\s+(flights|tickets|hotels)\b", re.IGNORECASE),
    re.compile(r"\b(today|tomorrow|yesterday)\b\s*$", re.IGNORECASE),
    re.compile(r"^\W*$"),  # only punctuation
    re.compile(r"^[A-Z]\.[A-Z]\.", ),  # initials like "T.S." (often person names)
]

# Country-style geo tokens (not exhaustive — just common false positives).
GEO_NOISE = {
    "india", "usa", "uk", "canada", "australia", "germany", "france",
    "italy", "spain", "mexico", "brazil", "japan", "china", "russia",
    "delhi", "mumbai", "london", "paris", "tokyo", "berlin",
}


# Base competition score per source class.
# Lower = newer / less saturated; higher = more established.
SOURCE_COMPETITION = {
    "trends_rising": 0.25,    # rising = opportunity
    "trends_top":    0.65,    # already popular
    "wikipedia":     0.55,    # established topic
    "reddit":        0.40,    # active discussion, varies
    "dataforseo":    0.50,    # neutral default; real competition (metadata) overrides
}

# Volume multiplier — interest (0-100) * this = rough search_volume_estimate.
# Deliberately rough; this is a comparative ranking, not an absolute prediction.
VOLUME_MULTIPLIER = 100


def _normalize_keyword(raw: str) -> str:
    return " ".join(raw.lower().strip().split())


def _significant_tokens(text: str) -> set[str]:
    """Lowercase alphabetic tokens of length >= 3, excluding stopwords."""
    tokens = re.findall(r"[a-z]+", text.lower())
    return {t for t in tokens if len(t) >= 3 and t not in STOPWORDS}


def _is_relevant(keyword: str, seed: str) -> bool:
    """At least one significant seed token must appear in the keyword.

    Falls back to substring of the full seed (case-insensitive) when the
    seed has no significant tokens (e.g. very short seeds like 'ai').
    """
    seed_tokens = _significant_tokens(seed)
    kw_tokens = _significant_tokens(keyword)
    if not seed_tokens:
        return seed.lower().strip() in keyword.lower()
    return bool(seed_tokens & kw_tokens)


def _is_noise(keyword: str) -> bool:
    if any(p.search(keyword) for p in NOISE_PATTERNS):
        return True
    tokens = re.findall(r"[a-z]+", keyword.lower())
    # Almost-pure-geo phrases like "delhi news"
    if tokens and all(t in GEO_NOISE or t in STOPWORDS for t in tokens):
        return True
    return False


def filter_signals(signals: list[RawSignal]) -> tuple[list[RawSignal], dict]:
    """Apply relevance + noise filters to RawSignals. Returns (kept, stats)."""
    stats = {"input": len(signals), "dropped_length": 0,
             "dropped_irrelevant": 0, "dropped_noise": 0, "dropped_seed_match": 0}
    kept: list[RawSignal] = []
    for s in signals:
        kw = _normalize_keyword(s.keyword)
        if not kw or len(kw) < 4 or len(kw) > 100:
            stats["dropped_length"] += 1
            continue
        # Has to have at least one alphabetic word
        if not re.search(r"[a-z]", kw):
            stats["dropped_length"] += 1
            continue
        if _is_noise(kw):
            stats["dropped_noise"] += 1
            continue
        seed = str((s.metadata or {}).get("seed", ""))
        if seed and kw == _normalize_keyword(seed):
            stats["dropped_seed_match"] += 1
            continue
        if seed and not _is_relevant(kw, seed):
            stats["dropped_irrelevant"] += 1
            continue
        kept.append(s)
    stats["kept"] = len(kept)
    return kept, stats


def merge_signals(signals: list[RawSignal]) -> dict[str, list[RawSignal]]:
    by_kw: dict[str, list[RawSignal]] = defaultdict(list)
    for s in signals:
        kw = _normalize_keyword(s.keyword)
        if not kw:
            continue
        by_kw[kw].append(s)
    return by_kw


def score_keyword(signals: list[RawSignal]) -> tuple[int, float, str]:
    """Return (volume_estimate, competition_score, source_label).

    REAL metrics win: when a source (DataForSEO) carried an absolute
    `search_volume` / `competition` in metadata, those are used verbatim instead
    of the interest-derived estimate / source-class heuristic. Falls back to the
    free-tool heuristics when no real metrics are present.
    """
    max_interest = max((s.interest for s in signals), default=0.0)
    sources = sorted({s.source for s in signals})

    real_volumes: list[int] = []
    real_comps: list[float] = []
    for s in signals:
        md = s.metadata or {}
        sv = md.get("search_volume")
        if isinstance(sv, (int, float)) and not isinstance(sv, bool):
            real_volumes.append(int(sv))
        cp = md.get("competition")
        if isinstance(cp, (int, float)) and not isinstance(cp, bool):
            real_comps.append(float(cp))

    if real_volumes:
        volume_est = max(real_volumes)
    else:
        volume_est = int(max_interest * VOLUME_MULTIPLIER)

    if real_comps:
        competition = sum(real_comps) / len(real_comps)
    elif sources:
        per_source = [SOURCE_COMPETITION.get(s, 0.5) for s in sources]
        competition = sum(per_source) / len(per_source)
        # Multi-source bonus to competition (more sources = more established)
        if len(sources) > 1:
            competition = min(1.0, competition + 0.05 * (len(sources) - 1))
    else:
        competition = 0.5

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
    filtered, filter_stats = filter_signals(signals)
    log.info(
        "filter: kept %d/%d (drop_len=%d noise=%d irrelev=%d seed=%d)",
        filter_stats["kept"], filter_stats["input"],
        filter_stats["dropped_length"], filter_stats["dropped_noise"],
        filter_stats["dropped_irrelevant"], filter_stats["dropped_seed_match"],
    )
    grouped = merge_signals(filtered)
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
