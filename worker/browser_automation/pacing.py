"""Pacing — human-like delays and AI Studio rate-limit handling.

Two responsibilities, kept independent so each can be wired in
separately by the orchestrator:

1. HumanPacing — jittered sleeps between browser actions so click
   patterns don't look mechanical.

2. RateLimitDetector + Cooldown — detect AI Studio quota / rate-limit
   UI signals from page text, surface the alert through a notifier
   callback (Telegram hook plugs in later), and pause for a cooldown.
   NEVER retries blindly — pause + notify + wait + return; caller
   decides whether to resume.

No browser dependency in this module — `RateLimitDetector.check`
takes plain text so it's trivially testable without Playwright.

Standalone smoke test (no browser needed):
    python -m browser_automation.pacing --test
"""

from __future__ import annotations

import argparse
import logging
import random
import sys
import time
from dataclasses import dataclass
from typing import Callable

log = logging.getLogger("pacing")

Notifier = Callable[[str], None]
Sleeper = Callable[[float], None]

# Substring match (case-insensitive) against page text. Update as new
# AI Studio quota/error copy is observed in the wild — same calibration
# discipline as selectors.yaml.
RATE_LIMIT_SIGNALS: tuple[str, ...] = (
    "quota",
    "rate limit",
    "too many requests",
    "you've reached",
    "try again later",
    "resource exhausted",
)

DEFAULT_COOLDOWN_S = 15 * 60       # 15 min when AI Studio doesn't tell us
MAX_COOLDOWN_S = 60 * 60           # never sleep more than 1 hour in one shot


@dataclass(frozen=True)
class RateLimitInfo:
    matched_signal: str
    raw_text: str
    cooldown_s: int


class HumanPacing:
    """Sleep human-like durations between actions.

    Profiles are (mean_seconds, stddev_seconds) for a Gaussian draw,
    floored at 50ms so we never produce negative or zero delays.
    """

    PROFILES: dict[str, tuple[float, float]] = {
        "click":    (0.30, 0.15),
        "type":     (0.80, 0.30),
        "submit":   (1.20, 0.40),
        "navigate": (2.00, 0.60),
    }
    DEFAULT_PROFILE: tuple[float, float] = (0.50, 0.20)
    MIN_DELAY_S: float = 0.05

    def __init__(self, rng: random.Random | None = None) -> None:
        self.rng = rng or random.Random()

    def delay_for(self, action: str) -> float:
        mean, std = self.PROFILES.get(action, self.DEFAULT_PROFILE)
        return max(self.MIN_DELAY_S, self.rng.gauss(mean, std))

    def sleep(self, action: str, sleeper: Sleeper = time.sleep) -> None:
        d = self.delay_for(action)
        log.debug("pacing: sleeping %.2fs for action=%s", d, action)
        sleeper(d)


class RateLimitDetector:
    """Inspect arbitrary page text for AI Studio rate-limit signals."""

    def __init__(
        self,
        signals: tuple[str, ...] = RATE_LIMIT_SIGNALS,
        default_cooldown_s: int = DEFAULT_COOLDOWN_S,
    ) -> None:
        self.signals = tuple(s.lower() for s in signals)
        self.default_cooldown_s = default_cooldown_s

    def check(self, page_text: str) -> RateLimitInfo | None:
        if not page_text:
            return None
        haystack = page_text.lower()
        for signal in self.signals:
            if signal in haystack:
                return RateLimitInfo(
                    matched_signal=signal,
                    raw_text=page_text[:500],
                    cooldown_s=self.default_cooldown_s,
                )
        return None


class Cooldown:
    """Pause + notify + sleep on rate-limit hit.

    Critically: this class never retries the upstream call. It pauses,
    notifies, sleeps, returns. The caller decides whether to resume.
    """

    def __init__(
        self,
        notifier: Notifier = lambda _msg: None,
        max_cooldown_s: int = MAX_COOLDOWN_S,
        sleeper: Sleeper = time.sleep,
    ) -> None:
        self.notifier = notifier
        self.max_cooldown_s = max_cooldown_s
        self.sleeper = sleeper

    def wait(self, info: RateLimitInfo) -> int:
        """Sleep for min(info.cooldown_s, max_cooldown_s); return seconds slept."""
        cooldown = max(0, min(info.cooldown_s, self.max_cooldown_s))
        msg = (
            f"AI Studio rate limit hit (signal: '{info.matched_signal}'). "
            f"Pausing for {cooldown}s. Snippet: {info.raw_text[:200]!r}"
        )
        log.warning(msg)
        try:
            self.notifier(msg)
        except Exception:
            log.exception("notifier raised; continuing cooldown anyway")
        if cooldown > 0:
            self.sleeper(cooldown)
        return cooldown


def _self_test() -> int:
    """Pure-Python smoke test — no browser, no real sleeps."""
    failures: list[str] = []

    pacing = HumanPacing(rng=random.Random(42))
    samples = {
        action: [pacing.delay_for(action) for _ in range(5)]
        for action in ("click", "type", "submit", "navigate", "unknown_action")
    }
    log.info("pacing samples: %s", {k: [round(v, 3) for v in vs] for k, vs in samples.items()})
    for action, vs in samples.items():
        if any(v < HumanPacing.MIN_DELAY_S for v in vs):
            failures.append(f"delay < MIN_DELAY_S for action={action}")

    detector = RateLimitDetector()
    hit = detector.check("Sorry, you've reached your daily quota. Try again later.")
    miss = detector.check("Here is your generated content.")
    empty = detector.check("")
    log.info("detector: hit=%s miss=%s empty=%s", hit, miss, empty)
    if hit is None:
        failures.append("detector missed a rate-limit phrase")
    if miss is not None or empty is not None:
        failures.append("detector matched a non-rate-limit string")

    notes: list[str] = []
    cooldown = Cooldown(
        notifier=notes.append,
        max_cooldown_s=1,
        sleeper=lambda _s: None,  # don't actually sleep in test
    )
    slept = cooldown.wait(
        RateLimitInfo(matched_signal="quota", raw_text="quota exceeded", cooldown_s=10_000)
    )
    if slept != 1:
        failures.append(f"cooldown.wait returned {slept}, expected 1 (clamped)")
    if not notes:
        failures.append("notifier was not called")

    if failures:
        for f in failures:
            log.error("self-test FAILURE: %s", f)
        return 1
    log.info("self-test PASSED")
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="pacing smoke test")
    p.add_argument("--test", action="store_true", help="run pure-Python smoke test")
    p.add_argument("--log-level", default="INFO")
    args = p.parse_args()
    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if args.test:
        sys.exit(_self_test())
    p.error("specify --test")


if __name__ == "__main__":
    main()
