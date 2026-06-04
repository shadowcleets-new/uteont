"""Tests for the DataForSEO source's pure parsing/scoring helpers."""

from agents.research_agent.dataforseo import (
    parse_keyword_suggestions,
    _volume_to_interest,
    _trend_ratio,
)


def _resp(items):
    return {"tasks": [{"status_code": 20000, "result": [{"items": items}]}]}


def test_parse_extracts_keyword_volume_competition_into_metadata():
    resp = _resp([
        {
            "keyword": "summer dresses for women",
            "keyword_info": {"search_volume": 14800, "competition": 0.42, "cpc": 0.9, "monthly_searches": []},
        },
    ])
    sigs = parse_keyword_suggestions(resp, "womens fashion")
    assert len(sigs) == 1
    s = sigs[0]
    assert s.keyword == "summer dresses for women"
    assert s.source == "dataforseo"
    assert s.metadata["search_volume"] == 14800
    assert s.metadata["competition"] == 0.42
    assert s.metadata["seed"] == "womens fashion"
    assert 0 < s.interest <= 100


def test_parse_skips_empty_keyword_and_handles_missing_info():
    resp = _resp([
        {"keyword": "", "keyword_info": {"search_volume": 100}},
        {"keyword": "valid kw"},  # no keyword_info at all
    ])
    sigs = parse_keyword_suggestions(resp, "seed")
    assert [s.keyword for s in sigs] == ["valid kw"]
    assert sigs[0].metadata["search_volume"] == 0


def test_parse_tolerates_malformed_responses():
    assert parse_keyword_suggestions({}, "seed") == []
    assert parse_keyword_suggestions({"tasks": []}, "seed") == []
    assert parse_keyword_suggestions({"tasks": [{"result": None}]}, "seed") == []


def test_volume_to_interest_monotonic_and_bounded():
    assert _volume_to_interest(0) >= 1.0
    assert _volume_to_interest(100) < _volume_to_interest(100000)
    assert _volume_to_interest(10**9) <= 100.0


def test_trend_ratio_detects_rising_flat_and_short():
    rising = [{"search_volume": v} for v in [300, 300, 300, 100, 100, 100]]
    assert _trend_ratio(rising) > 1.5
    flat = [{"search_volume": 100} for _ in range(6)]
    assert abs(_trend_ratio(flat) - 1.0) < 0.01
    assert _trend_ratio([]) == 1.0
    assert _trend_ratio(None) == 1.0
