"""score_keyword must use REAL DataForSEO metrics when present, else heuristics."""

from agents.research_agent.models import RawSignal
from agents.research_agent.scoring import score_keyword


def test_uses_real_dataforseo_volume_and_competition():
    sigs = [RawSignal(keyword="x", interest=40.0, source="dataforseo",
                      metadata={"search_volume": 12000, "competition": 0.3})]
    volume, competition, label = score_keyword(sigs)
    assert volume == 12000          # real volume, NOT interest * multiplier
    assert competition == 0.3       # real competition, NOT a source heuristic
    assert "dataforseo" in label


def test_falls_back_to_heuristic_without_real_metrics():
    sigs = [RawSignal(keyword="x", interest=50.0, source="trends_rising", metadata={})]
    volume, competition, label = score_keyword(sigs)
    assert volume == 5000           # 50 * VOLUME_MULTIPLIER (100)
    assert competition == 0.25      # trends_rising base competition


def test_real_volume_wins_when_keyword_seen_by_multiple_sources():
    sigs = [
        RawSignal(keyword="x", interest=90.0, source="trends_rising", metadata={}),
        RawSignal(keyword="x", interest=40.0, source="dataforseo",
                  metadata={"search_volume": 8000, "competition": 0.5}),
    ]
    volume, competition, label = score_keyword(sigs)
    assert volume == 8000           # DataForSEO real volume beats trends interest
    assert "dataforseo" in label and "trends_rising" in label
