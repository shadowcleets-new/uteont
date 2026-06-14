"""
@file scoring.py
@description Pure trend-scoring core (plan SS-C.4). Standard-library only, no DB,
             no network, no clock, no randomness — every input is supplied by the
             caller so results are fully deterministic and unit-testable.

[TABLE OF CONTENTS]
1. IMPORTS & DEPENDENCIES
2. LOCAL CONSTANTS & CONFIG
3. PUBLIC API
   - clamp
   - intent_weight
   - ema_slope
   - score_trend
4. HELPER UTILITIES
"""

# #region 1. Imports & dependencies
import math
# #endregion


# #region 2. Local constants & config
# Search-intent -> demand-weight. Higher means closer to a purchase action.
_INTENT_WEIGHTS = {
    "transactional": 1.0,
    "commercial": 0.8,
    "informational": 0.4,
    "navigational": 0.1,
}
_DEFAULT_INTENT_WEIGHT = 0.4  # unknown / empty intent behaves like informational

# Composite-score term weights (must sum to 1.0). See score_trend docstring.
_W_VOLUME = 0.30
_W_VELOCITY = 0.25
_W_ACCEL = 0.20
_W_INTENT = 0.15
_W_SERP_GAP = 0.10

# Default EMA smoothing factor: a 7-period exponential moving average.
_DEFAULT_ALPHA = 2.0 / (7.0 + 1.0)
# #endregion


# #region 3. Public API
def clamp(x, lo=0.0, hi=1.0):
    """Constrain ``x`` to the inclusive range ``[lo, hi]``.

    Defensive: any non-finite or non-numeric value collapses to ``lo`` so a bad
    upstream feature can never crash the scorer or escape the bounds.
    Returns a ``float``.
    """
    value = _coerce_float(x)
    if value is None or math.isnan(value):
        return float(lo)
    if value < lo:
        return float(lo)
    if value > hi:
        return float(hi)
    return float(value)


def intent_weight(intent):
    """Map a search-intent label to its demand weight.

    transactional 1.0 > commercial 0.8 > informational 0.4 > navigational 0.1.
    Unknown / empty / ``None`` -> 0.4 (default). Case- and whitespace-insensitive.
    """
    if not isinstance(intent, str):
        return _DEFAULT_INTENT_WEIGHT
    key = intent.strip().lower()
    return _INTENT_WEIGHTS.get(key, _DEFAULT_INTENT_WEIGHT)


def ema_slope(series, alpha=_DEFAULT_ALPHA):
    """Exponential moving average of consecutive deltas of ``series``.

    Computes ``series[i] - series[i-1]`` for each consecutive pair, then folds an
    EMA over those deltas. A positive result means the series is rising, zero
    means flat, negative means decaying.

    Defensive: non-numeric entries are skipped, too-short or invalid input yields
    ``0.0``, and the function never raises. Returns a ``float``.
    """
    cleaned = _clean_numeric_series(series)
    if len(cleaned) < 2:
        return 0.0

    a = _coerce_float(alpha)
    if a is None or math.isnan(a) or not (0.0 < a <= 1.0):
        a = _DEFAULT_ALPHA

    deltas = [cleaned[i] - cleaned[i - 1] for i in range(1, len(cleaned))]
    ema = deltas[0]
    for d in deltas[1:]:
        ema = a * d + (1.0 - a) * ema
    return float(ema)


def score_trend(volume_norm, velocity, accel, intent, serp_gap_norm=0.0):
    """Composite trend score in ``[0, 1]`` (plan SS-C.4).

    score = 0.30*clamp(volume_norm)
          + 0.25*clamp(velocity)
          + 0.20*clamp(accel)
          + 0.15*intent_weight(intent)
          + 0.10*clamp(serp_gap_norm)

    Every numeric term is clamped to ``[0, 1]`` and the weights sum to 1.0, so the
    result is guaranteed to stay within ``[0, 1]`` for any input. Returns a float.
    """
    return (
        _W_VOLUME * clamp(volume_norm)
        + _W_VELOCITY * clamp(velocity)
        + _W_ACCEL * clamp(accel)
        + _W_INTENT * intent_weight(intent)
        + _W_SERP_GAP * clamp(serp_gap_norm)
    )
# #endregion


# #region 4. Helper utilities
def _coerce_float(x):
    """Best-effort float conversion. Returns ``None`` on failure (never raises)."""
    if isinstance(x, bool):
        # Avoid treating booleans as 1/0 numerics — they are not valid features.
        return None
    if isinstance(x, (int, float)):
        return float(x)
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _clean_numeric_series(series):
    """Coerce an iterable into a list of finite floats, skipping bad entries."""
    if series is None:
        return []
    try:
        iterator = iter(series)
    except TypeError:
        return []
    out = []
    for item in iterator:
        value = _coerce_float(item)
        if value is None or math.isnan(value) or math.isinf(value):
            continue
        out.append(value)
    return out
# #endregion
