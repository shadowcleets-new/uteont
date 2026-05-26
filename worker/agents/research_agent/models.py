"""Data models for Research Agent — locked output schema lives here."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class RawSignal:
    """One raw keyword observation from a single source.

    Intermediate representation — gets merged + ranked into KeywordResult.
    """
    keyword: str
    interest: float        # 0-100 normalized score from the source
    source: str            # 'trends_top' | 'trends_rising' | 'wikipedia' | 'reddit'
    metadata: dict = field(default_factory=dict)


@dataclass
class KeywordResult:
    """Final output row — matches the contract locked at session start.

    DO NOT add or rename fields without coordinating with downstream agents.
    Agent 2 (Idea Generation) consumes this schema.
    """
    keyword: str
    search_volume_estimate: int
    competition_score: float      # 0.0 (easy) .. 1.0 (hard)
    source: str                   # '+'-joined origins, e.g. 'trends_top+wikipedia'
    timestamp: str                # ISO 8601 UTC
    priority_rank: int            # 1 = highest priority

    def to_dict(self) -> dict:
        return asdict(self)
