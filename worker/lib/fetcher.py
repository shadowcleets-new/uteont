#!/usr/bin/env python3
"""
fetcher.py — IP-15 · the resilient, polite, self-protecting scraping core.

Every new worker scraper (trends, SERP, semantic, rank) shares this one fetch
layer so the platform stays a good web citizen and protects itself from
bot-walling: a per-domain token bucket (rate limit), a circuit breaker that
trips on a 429/403 spike and serves the last-good cache instead of hammering,
and a per-domain minimum-interval throttle.

The control primitives (TokenBucket, CircuitBreaker, DomainThrottle) are PURE:
all time comes from an injected ``clock`` callable so behaviour is fully
deterministic and unit-testable with a FakeClock — no real time, no network
(see fetcher_test.py). The ResilientFetcher at the bottom composes them with a
stdlib HTTP GET, robots honouring, and a last-good cache.

[TABLE OF CONTENTS]
1. IMPORTS & DEPENDENCIES
2. CLOCK DEFAULT
3. TOKEN BUCKET
4. CIRCUIT BREAKER
5. DOMAIN THROTTLE
6. RESILIENT FETCHER (thin I/O composition)
"""

# #region 1. Imports & Dependencies
from __future__ import annotations

import ipaddress
import socket
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser
from typing import Callable, Dict, Optional
# #endregion


# #region 1b. SSRF guard (N-09)
def assert_public_url(url: str, *, _resolver: Callable = socket.getaddrinfo) -> None:
    """Raise ValueError unless ``url`` is a public http(s) URL.

    SSRF guard: rejects non-http(s) schemes and any host that resolves to a
    loopback / private / link-local / reserved / multicast / unspecified
    address (so a crafted URL can't make the worker reach the cloud metadata
    endpoint, localhost, or the internal network). ``_resolver`` is injectable
    so tests can drive resolution without real DNS."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"refusing non-http(s) URL: {url!r}")
    host = parsed.hostname
    if not host:
        raise ValueError(f"refusing URL with no host: {url!r}")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = _resolver(host, port, proto=socket.IPPROTO_TCP)
    except OSError as exc:
        raise ValueError(f"cannot resolve host {host!r}: {exc}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise ValueError(f"refusing non-public address {ip} for host {host!r}")
# #endregion


# #region 2. Clock default
def _default_clock() -> float:
    """Monotonic wall-clock seconds. Overridden by an injected clock in tests."""
    return time.monotonic()
# #endregion


# #region 3. Token Bucket
class TokenBucket:
    """A classic token bucket: tokens refill at ``rate_per_sec`` up to
    ``capacity`` and ``try_acquire(n)`` spends ``n`` of them when available.

    Starts full. A request for more tokens than the capacity can ever satisfy
    is denied outright (defensive — it would otherwise block forever)."""

    def __init__(self, rate_per_sec: float, capacity: int, clock: Callable[[], float] = _default_clock):
        self.rate = float(rate_per_sec)
        self.capacity = float(capacity)
        self._clock = clock
        self._tokens = float(capacity)
        self._last = clock()

    def _refill(self) -> None:
        now = self._clock()
        elapsed = now - self._last
        self._last = now
        if elapsed > 0:
            self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)

    def try_acquire(self, n: int = 1) -> bool:
        if n > self.capacity:
            return False  # impossible request — never succeeds
        self._refill()
        if self._tokens >= n:
            self._tokens -= n
            return True
        return False
# #endregion


# #region 4. Circuit Breaker
class CircuitBreaker:
    """Three-state breaker. CLOSED → (failure_threshold failures) → OPEN →
    (recovery_time elapsed) → HALF_OPEN (one trial) → success ⇒ CLOSED, or
    failure ⇒ OPEN with a fresh recovery stamp.

    HALF_OPEN admits exactly one in-flight trial: the ``allow()`` that performs
    the OPEN→HALF_OPEN transition returns True and consumes the trial; any
    further ``allow()`` is denied until the trial is resolved."""

    def __init__(self, failure_threshold: int, recovery_time: float, clock: Callable[[], float] = _default_clock):
        self.failure_threshold = int(failure_threshold)
        self.recovery_time = float(recovery_time)
        self._clock = clock
        self.state = "CLOSED"
        self._failures = 0
        self._opened_at = 0.0
        self._trial_in_flight = False

    def allow(self) -> bool:
        if self.state == "CLOSED":
            return True
        if self.state == "OPEN":
            if self._clock() - self._opened_at >= self.recovery_time:
                self.state = "HALF_OPEN"
                self._trial_in_flight = True
                return True
            return False
        # HALF_OPEN — only the single trial granted at transition may proceed.
        return False

    def record_success(self) -> None:
        self.state = "CLOSED"
        self._failures = 0
        self._trial_in_flight = False

    def record_failure(self) -> None:
        if self.state == "HALF_OPEN":
            # A failed trial re-opens the breaker with a fresh recovery window.
            self.state = "OPEN"
            self._opened_at = self._clock()
            self._trial_in_flight = False
            return
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self.state = "OPEN"
            self._opened_at = self._clock()
# #endregion


# #region 5. Domain Throttle
class DomainThrottle:
    """Enforces a minimum interval between hits to the same domain. The first
    hit to any domain is always allowed; subsequent hits are allowed only once
    ``min_interval`` seconds have elapsed since the last permitted hit. A
    permitted hit re-arms the throttle for that domain."""

    def __init__(self, min_interval: float, clock: Callable[[], float] = _default_clock):
        self.min_interval = float(min_interval)
        self._clock = clock
        self._last_hit: Dict[str, float] = {}

    def allow(self, domain: str) -> bool:
        now = self._clock()
        last = self._last_hit.get(domain)
        if last is None or (now - last) >= self.min_interval:
            self._last_hit[domain] = now
            return True
        return False
# #endregion


# #region 6. Resilient Fetcher (thin I/O composition)
class ResilientFetcher:
    """Composes the three primitives with a stdlib HTTP GET. On a tripped
    breaker it serves the last-good cached body for that URL rather than
    hammering the origin ("slow but never lie"). Robots are honoured per host.

    Pure logic lives in the primitives above; this class is the thin I/O shell
    and is intentionally simple. SSRF guarding is the caller's job (mirror
    agents/tactics_scraper_agent/sources.py:assert_public_url before calling)."""

    def __init__(
        self,
        rate_per_sec: float = 0.66,         # ≈1 req / 1.5s per domain
        capacity: int = 4,
        min_interval: float = 1.5,
        failure_threshold: int = 5,
        recovery_time: float = 60.0,
        user_agent: str = "UTEONT-bot/1.0 (+https://uteont.app/bot)",
        timeout: float = 15.0,
        clock: Callable[[], float] = _default_clock,
    ):
        self._clock = clock
        self.user_agent = user_agent
        self.timeout = timeout
        self._buckets: Dict[str, TokenBucket] = {}
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._throttle = DomainThrottle(min_interval, clock=clock)
        self._cache: Dict[str, str] = {}
        self._robots: Dict[str, RobotFileParser] = {}
        self._cfg = dict(
            rate_per_sec=rate_per_sec,
            capacity=capacity,
            failure_threshold=failure_threshold,
            recovery_time=recovery_time,
        )

    def _bucket(self, domain: str) -> TokenBucket:
        if domain not in self._buckets:
            self._buckets[domain] = TokenBucket(
                self._cfg["rate_per_sec"], self._cfg["capacity"], clock=self._clock
            )
        return self._buckets[domain]

    def _breaker(self, domain: str) -> CircuitBreaker:
        if domain not in self._breakers:
            self._breakers[domain] = CircuitBreaker(
                self._cfg["failure_threshold"], self._cfg["recovery_time"], clock=self._clock
            )
        return self._breakers[domain]

    def _robots_ok(self, url: str, domain: str, scheme: str) -> bool:
        rp = self._robots.get(domain)
        if rp is None:
            rp = RobotFileParser()
            # N-16: RobotFileParser.read() does a urlopen with NO timeout and can
            # hang the whole fetch path. Fetch robots.txt ourselves with a timeout,
            # then parse. Always store the parser (even on failure) so a dead/slow
            # robots host is negative-cached, not re-fetched on every request.
            try:
                req = urllib.request.Request(
                    f"{scheme}://{domain}/robots.txt",
                    headers={"User-Agent": self.user_agent},
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    text = resp.read().decode("utf-8", errors="replace")
                rp.parse(text.splitlines())
            except Exception:
                # Unreachable/slow robots → best-effort allow, but cache that
                # decision so we don't keep hanging/hammering on it.
                rp.allow_all = True
            self._robots[domain] = rp
        try:
            return rp.can_fetch(self.user_agent, url)
        except Exception:
            return True

    def get(self, url: str) -> Optional[str]:
        """Return the response body, or the last-good cached body when the
        breaker is open / the request is throttled, or None if nothing is
        available. Never raises on a network error."""
        parsed = urlparse(url)
        domain = parsed.netloc
        scheme = parsed.scheme or "https"
        if not domain:
            return None

        # N-09: SSRF guard before any network I/O. A non-public target is refused
        # (returns None) rather than fetched — get() never raises by contract.
        try:
            assert_public_url(url)
        except ValueError:
            return None

        breaker = self._breaker(domain)
        if not breaker.allow():
            return self._cache.get(url)  # breaker open → serve cache, don't hammer
        if not self._robots_ok(url, domain, scheme):
            return None
        if not self._throttle.allow(domain) or not self._bucket(domain).try_acquire():
            return self._cache.get(url)  # throttled → serve cache rather than burst

        req = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8", errors="replace")
            breaker.record_success()
            self._cache[url] = body
            return body
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 403):
                breaker.record_failure()
            return self._cache.get(url)
        except Exception:
            breaker.record_failure()
            return self._cache.get(url)
# #endregion
