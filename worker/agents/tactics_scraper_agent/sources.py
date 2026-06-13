"""Source classification + defaults for the Tactics Scraper.

A "source" is any URL the operator pastes (a subreddit, an HN front page, a
blog, a forum, an X account/post) — or, when none is given, the six default
communities. classify_source maps a URL to one of the tactics.source_type
enum values so the scraper picks the right fetch strategy.
"""

from __future__ import annotations

import ipaddress
import socket
import urllib.parse

# The tactics.source_type enum (mirrors src/lib/db/schema.ts).
SOURCE_TYPES = ("reddit", "hn", "forum", "blog", "x", "other", "notebooklm-derived")


class BlockedUrlError(ValueError):
    """Raised when a source URL targets a non-public host (SSRF guard)."""


def _ip_is_blocked(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True  # unparseable → refuse
    return (
        addr.is_loopback
        or addr.is_private
        or addr.is_link_local      # incl. 169.254.169.254 cloud metadata
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def assert_public_url(url: str) -> None:
    """SSRF guard (mirrors src/lib/agents/safe-fetch.ts). Enforce http/https and
    resolve the host, rejecting any address in a loopback/private/link-local/
    reserved range — defeats file://, the cloud-metadata IP, RFC-1918, and DNS
    rebinding (we check the resolved IPs, not just the hostname). Raises
    BlockedUrlError on refusal."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise BlockedUrlError(f"refusing non-http(s) URL: {parsed.scheme or '(none)'}")
    host = parsed.hostname
    if not host:
        raise BlockedUrlError("refusing URL with no host")
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as e:
        raise BlockedUrlError(f"cannot resolve host {host}: {e}") from e
    for info in infos:
        ip = info[4][0]
        if _ip_is_blocked(ip):
            raise BlockedUrlError(f"refusing {host} — resolves to non-public IP {ip}")

# Default communities scraped when the operator gives no explicit source.
DEFAULT_SOURCES = [
    "https://www.reddit.com/r/SEO/",
    "https://www.reddit.com/r/bigseo/",
    "https://www.reddit.com/r/marketing/",
    "https://www.reddit.com/r/TechSEO/",
    "https://news.ycombinator.com/",
    "https://support.google.com/webmasters/community",
]


def classify_source(url: str) -> str:
    """Return the tactics.source_type for a URL (best-effort, never raises)."""
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception:
        return "other"
    if "reddit.com" in host:
        return "reddit"
    if "news.ycombinator.com" in host or host == "hn.algolia.com":
        return "hn"
    if host in ("x.com", "twitter.com") or host.endswith(".x.com"):
        return "x"
    if "support.google.com" in host or "forum" in host or "community" in url:
        return "forum"
    if host:
        return "blog"
    return "other"


def subreddit_of(url: str) -> str | None:
    """Extract the subreddit name from a reddit URL, or None."""
    try:
        parts = [p for p in urllib.parse.urlparse(url).path.split("/") if p]
        if len(parts) >= 2 and parts[0].lower() == "r":
            return parts[1]
    except Exception:
        return None
    return None
