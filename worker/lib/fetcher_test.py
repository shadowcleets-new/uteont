#!/usr/bin/env python3
"""
fetcher_test.py

Deterministic, network-free unit tests for the resilient scraping core
(TokenBucket, CircuitBreaker, DomainThrottle) defined in ``fetcher.py``.

Time is supplied via an injected FakeClock so every assertion is reproducible.
Runnable directly:  python worker/lib/fetcher_test.py
On all-pass it prints "OK" and exits 0; on any failure it prints the failing
assertion message and exits 1.

[TABLE OF CONTENTS]
1. IMPORTS & DEPENDENCIES
2. TEST HARNESS (FakeClock + assert helper)
3. CIRCUIT BREAKER TESTS
4. TOKEN BUCKET TESTS
5. DOMAIN THROTTLE TESTS
6. ENTRYPOINT
"""

# #region 1. Imports & Dependencies
import sys
import os

# Allow running as a loose script (python worker/lib/fetcher_test.py) by
# ensuring this file's own directory is importable, then fall back to the
# package-relative import when executed via -m.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from fetcher import TokenBucket, CircuitBreaker, DomainThrottle
except ImportError:  # pragma: no cover - package execution path
    from worker.lib.fetcher import TokenBucket, CircuitBreaker, DomainThrottle
# #endregion


# #region 2. Test Harness (FakeClock + assert helper)
class FakeClock:
    """A mutable, monotonic-ish clock with a manual advance() control."""

    def __init__(self, start=0.0):
        self.now = float(start)

    def advance(self, seconds):
        self.now += float(seconds)

    def __call__(self):
        return self.now


def check(condition, message):
    if not condition:
        print("FAIL: " + message)
        sys.exit(1)
# #endregion


# #region 3. Circuit Breaker Tests
def test_circuit_breaker_open_recover_close():
    clock = FakeClock(start=1000.0)
    cb = CircuitBreaker(failure_threshold=3, recovery_time=30.0, clock=clock)

    # Healthy by default.
    check(cb.allow() is True, "fresh breaker should allow requests")
    check(cb.state == "CLOSED", "fresh breaker should be CLOSED")

    # A burst of failures at/over threshold opens the breaker.
    cb.record_failure()
    cb.record_failure()
    check(cb.state == "CLOSED", "below-threshold failures keep breaker CLOSED")
    cb.record_failure()  # 3rd failure == threshold
    check(cb.state == "OPEN", "threshold failures must OPEN the breaker")
    check(cb.allow() is False, "OPEN breaker within recovery_time blocks requests")

    # Still within recovery window -> stays blocked.
    clock.advance(29.0)
    check(cb.allow() is False, "OPEN breaker before recovery_time still blocks")

    # Past recovery_time -> HALF_OPEN, allow exactly one trial.
    clock.advance(2.0)  # total +31s > recovery_time
    check(cb.allow() is True, "after recovery_time breaker allows a trial")
    check(cb.state == "HALF_OPEN", "after recovery_time breaker is HALF_OPEN")
    # The trial is exclusive: a second probe is denied while half-open.
    check(cb.allow() is False, "HALF_OPEN allows only a single in-flight trial")

    # A success on the trial closes the breaker and resets the counter.
    cb.record_success()
    check(cb.state == "CLOSED", "success on trial must CLOSE the breaker")
    check(cb.allow() is True, "CLOSED breaker allows requests again")

    # Counter was reset: it again takes a full threshold of failures to reopen.
    cb.record_failure()
    cb.record_failure()
    check(cb.state == "CLOSED", "failure counter reset after success")
    cb.record_failure()
    check(cb.state == "OPEN", "breaker reopens after a fresh failure burst")


def test_circuit_breaker_half_open_failure_reopens():
    clock = FakeClock(start=0.0)
    cb = CircuitBreaker(failure_threshold=2, recovery_time=10.0, clock=clock)

    cb.record_failure()
    cb.record_failure()
    check(cb.state == "OPEN", "breaker opens at threshold")

    clock.advance(11.0)
    check(cb.allow() is True, "trial permitted after recovery window")
    check(cb.state == "HALF_OPEN", "breaker half-open after recovery window")

    # Trial failed -> back to OPEN, with a fresh recovery stamp.
    cb.record_failure()
    check(cb.state == "OPEN", "failed trial reopens the breaker")
    check(cb.allow() is False, "reopened breaker blocks immediately")

    clock.advance(11.0)
    check(cb.allow() is True, "breaker allows trial after second recovery window")
# #endregion


# #region 4. Token Bucket Tests
def test_token_bucket_drain_and_refill():
    clock = FakeClock(start=500.0)
    # 2 tokens/sec, capacity 5.
    tb = TokenBucket(rate_per_sec=2.0, capacity=5, clock=clock)

    # Drain the full capacity.
    for i in range(5):
        check(tb.try_acquire() is True, "acquire #%d within capacity should pass" % i)
    # Bucket empty -> denied.
    check(tb.try_acquire() is False, "acquire on empty bucket should fail")

    # No time passed -> still empty.
    check(tb.try_acquire() is False, "still empty without elapsed time")

    # Advance 1s -> +2 tokens at rate 2/sec.
    clock.advance(1.0)
    check(tb.try_acquire() is True, "1st token after 1s refill")
    check(tb.try_acquire() is True, "2nd token after 1s refill")
    check(tb.try_acquire() is False, "rate enforced: only 2 tokens after 1s")


def test_token_bucket_capacity_cap():
    clock = FakeClock(start=0.0)
    tb = TokenBucket(rate_per_sec=10.0, capacity=3, clock=clock)

    # Idle a long time; refill must not exceed capacity.
    clock.advance(100.0)
    check(tb.try_acquire() is True, "capacity cap: token 1")
    check(tb.try_acquire() is True, "capacity cap: token 2")
    check(tb.try_acquire() is True, "capacity cap: token 3")
    check(tb.try_acquire() is False, "refill is capped at capacity, not unbounded")


def test_token_bucket_multi_token_acquire():
    clock = FakeClock(start=0.0)
    tb = TokenBucket(rate_per_sec=1.0, capacity=10, clock=clock)

    check(tb.try_acquire(4) is True, "multi-token acquire within budget")
    check(tb.try_acquire(6) is True, "multi-token acquire draining remainder")
    check(tb.try_acquire(1) is False, "no tokens left for further acquire")

    # Defensive: a request larger than capacity can never succeed.
    clock.advance(1000.0)
    check(tb.try_acquire(11) is False, "request above capacity always denied")
# #endregion


# #region 5. Domain Throttle Tests
def test_domain_throttle_per_domain_interval():
    clock = FakeClock(start=42.0)
    dt = DomainThrottle(min_interval=1.5, clock=clock)

    # First request to a domain is always allowed.
    check(dt.allow("example.com") is True, "first hit to a domain allowed")
    # Immediate second request to same domain blocked.
    check(dt.allow("example.com") is False, "immediate second hit blocked")

    # A different domain is independent and allowed immediately.
    check(dt.allow("other.org") is True, "different domain is independent")
    check(dt.allow("other.org") is False, "second hit to other domain blocked")

    # Not enough time elapsed yet for example.com.
    clock.advance(1.0)
    check(dt.allow("example.com") is False, "still within min_interval -> blocked")

    # Cross the interval boundary -> allowed again.
    clock.advance(0.6)  # total +1.6s > 1.5s
    check(dt.allow("example.com") is True, "after min_interval the domain is allowed")
    # And it re-arms the throttle for that domain.
    check(dt.allow("example.com") is False, "throttle re-arms after a permitted hit")
# #endregion


# #region 6. Entrypoint
def main():
    tests = [
        test_circuit_breaker_open_recover_close,
        test_circuit_breaker_half_open_failure_reopens,
        test_token_bucket_drain_and_refill,
        test_token_bucket_capacity_cap,
        test_token_bucket_multi_token_acquire,
        test_domain_throttle_per_domain_interval,
    ]
    for t in tests:
        t()
    print("OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
# #endregion
