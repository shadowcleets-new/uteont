"""
@file scoring_test.py
@description Deterministic, stdlib-only test suite for the trend-scoring core
             (plan SS-C.4). Runnable directly:
                 python worker/agents/trends_agent/scoring_test.py
             Prints "OK" and exits 0 on success; prints the failure and exits 1.

[TABLE OF CONTENTS]
1. IMPORTS & PATH BOOTSTRAP
2. CLAMP TESTS
3. INTENT-WEIGHT TESTS
4. EMA-SLOPE TESTS
5. SCORE-TREND TESTS
6. TEST RUNNER / ENTRYPOINT
"""

# #region 1. Imports & path bootstrap
import math
import os
import sys

# Allow running as a bare script (python worker/agents/trends_agent/scoring_test.py)
# without an installed package, while still preferring the local module.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scoring import clamp, intent_weight, ema_slope, score_trend  # noqa: E402
# #endregion


# #region 2. Clamp tests
def test_clamp_bounds():
    assert clamp(0.5) == 0.5
    assert clamp(-1.0) == 0.0
    assert clamp(2.0) == 1.0
    # Custom bounds.
    assert clamp(5.0, lo=0.0, hi=10.0) == 5.0
    assert clamp(-3.0, lo=-2.0, hi=2.0) == -2.0
    assert clamp(99.0, lo=-2.0, hi=2.0) == 2.0
    # Edge: exactly on the bounds.
    assert clamp(0.0) == 0.0
    assert clamp(1.0) == 1.0
    # Defensive: non-finite / garbage collapses to lo (never crashes).
    assert clamp(float("nan")) == 0.0
    assert clamp(float("inf")) == 1.0
    assert clamp(float("-inf")) == 0.0
    assert clamp(None) == 0.0
    assert clamp("not-a-number") == 0.0
# #endregion


# #region 3. Intent-weight tests
def test_intent_weight_ordering():
    t = intent_weight("transactional")
    c = intent_weight("commercial")
    i = intent_weight("informational")
    n = intent_weight("navigational")
    assert t > c > i > n, (t, c, i, n)
    assert t == 1.0
    assert c == 0.8
    assert i == 0.4
    assert n == 0.1


def test_intent_weight_default_and_robustness():
    # Unknown / empty / None -> default 0.4 (== informational).
    assert intent_weight("something-else") == 0.4
    assert intent_weight("") == 0.4
    assert intent_weight(None) == 0.4
    # Case / whitespace insensitive.
    assert intent_weight("  TRANSACTIONAL  ") == 1.0
    assert intent_weight("Commercial") == 0.8
# #endregion


# #region 4. EMA-slope tests
def test_ema_slope_direction():
    rising = [10, 12, 15, 19, 24, 30, 37]
    flat = [20, 20, 20, 20, 20, 20, 20]
    decaying = [37, 30, 24, 19, 15, 12, 10]
    assert ema_slope(rising) > 0.0
    assert ema_slope(flat) == 0.0
    assert ema_slope(decaying) < 0.0
    # Rising strictly beats flat beats decaying.
    assert ema_slope(rising) > ema_slope(flat) > ema_slope(decaying)


def test_ema_slope_edge_cases():
    # Too-short series have no deltas -> slope 0.0 (no crash).
    assert ema_slope([]) == 0.0
    assert ema_slope([5]) == 0.0
    # Single delta.
    assert ema_slope([1, 4]) == 3.0
    # Robust to garbage entries (skipped / coerced), never raises.
    assert isinstance(ema_slope([1, 2, None, 4]), float)
    assert isinstance(ema_slope(None), float)
# #endregion


# #region 5. Score-trend tests
def _vel(series):
    """Map a raw interest series to a normalized velocity in [0,1]."""
    return clamp(ema_slope(series))


def test_score_rising_beats_flat_beats_decaying():
    rising = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
    flat = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    decaying = [1.0, 0.8, 0.6, 0.4, 0.2, 0.0]

    s_rise = score_trend(0.5, _vel(rising), 0.0, "informational")
    s_flat = score_trend(0.5, _vel(flat), 0.0, "informational")
    s_decay = score_trend(0.5, _vel(decaying), 0.0, "informational")

    # Per the authoritative formula (plan §C.4) velocity is clamped to [0, 1],
    # so a decaying series (negative slope) floors to the same 0 velocity as a
    # flat one and can never out-score it. Rising strictly wins; flat ≥ decay.
    assert s_rise > s_flat >= s_decay, (s_rise, s_flat, s_decay)


def test_score_within_unit_interval():
    # All-max in-range inputs -> exactly 1.0.
    assert abs(score_trend(1.0, 1.0, 1.0, "transactional", 1.0) - 1.0) < 1e-9
    # All-min in-range inputs with the lowest-weight intent -> 0.015.
    lo = score_trend(0.0, 0.0, 0.0, "navigational", 0.0)
    assert abs(lo - 0.15 * 0.1) < 1e-9
    # Out-of-range inputs are clamped, never escaping [0,1].
    hi = score_trend(5.0, 5.0, 5.0, "transactional", 5.0)
    assert hi <= 1.0
    neg = score_trend(-5.0, -5.0, -5.0, "navigational", -5.0)
    assert neg >= 0.0
    # serp_gap defaults to 0.0 and stays in range.
    mid = score_trend(0.5, 0.5, 0.5, "commercial")
    assert 0.0 <= mid <= 1.0


def test_score_weighting_matches_spec():
    # Isolate each weighted term and confirm the documented coefficient.
    assert abs(score_trend(1.0, 0.0, 0.0, "navigational", 0.0) -
               (0.30 + 0.15 * 0.1)) < 1e-9
    assert abs(score_trend(0.0, 1.0, 0.0, "navigational", 0.0) -
               (0.25 + 0.15 * 0.1)) < 1e-9
    assert abs(score_trend(0.0, 0.0, 1.0, "navigational", 0.0) -
               (0.20 + 0.15 * 0.1)) < 1e-9
    assert abs(score_trend(0.0, 0.0, 0.0, "navigational", 1.0) -
               (0.10 + 0.15 * 0.1)) < 1e-9
# #endregion


# #region 6. Test runner / entrypoint
def _run_all():
    tests = [
        test_clamp_bounds,
        test_intent_weight_ordering,
        test_intent_weight_default_and_robustness,
        test_ema_slope_direction,
        test_ema_slope_edge_cases,
        test_score_rising_beats_flat_beats_decaying,
        test_score_within_unit_interval,
        test_score_weighting_matches_spec,
    ]
    for t in tests:
        t()
    return len(tests)


if __name__ == "__main__":
    try:
        n = _run_all()
    except AssertionError as exc:
        sys.stderr.write("FAIL (assertion): {}\n".format(exc))
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001 - surface any unexpected failure
        sys.stderr.write("FAIL (error): {!r}\n".format(exc))
        sys.exit(1)
    print("OK ({} tests)".format(n))
    sys.exit(0)
# #endregion
