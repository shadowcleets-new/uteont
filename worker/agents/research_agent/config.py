"""Research Agent configuration — env-vars only, zero hardcoded credentials.

Reads from os.environ. If python-dotenv is installed and a .env file exists in
the project root, it is loaded first. The agent runs without a .env (Reddit
source just disables itself if credentials are missing).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


# Default seed keywords — used when RESEARCH_SEED_KEYWORDS is unset.
# Kept generic so the agent can produce output on a fresh install without
# any configuration. Override via env or the CLI --seed flag.
DEFAULT_SEEDS = [
    "ai tools",
    "content marketing",
    "seo strategy",
]

DEFAULT_OUTPUT_PATH = Path("agents/research_agent/output/keywords.json")
DEFAULT_PERFORMANCE_PATH = Path("contracts/performance.example.json")
DEFAULT_LOG_DB_PATH = Path("agents/research_agent/.data/runs.db")
DEFAULT_MIN_RESULTS = 10
DEFAULT_MAX_RESULTS = 50


def _load_dotenv_if_present() -> None:
    """Load .env if python-dotenv is installed. Silent no-op otherwise."""
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
    except ImportError:
        pass


def _env_list(key: str, default: list[str]) -> list[str]:
    raw = os.environ.get(key)
    if not raw:
        return list(default)
    return [s.strip() for s in raw.split(",") if s.strip()]


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, default))
    except (TypeError, ValueError):
        return default


def _env_path(key: str, default: Path) -> Path:
    raw = os.environ.get(key)
    return Path(raw) if raw else default


@dataclass
class Config:
    seed_keywords:    list[str]
    output_path:      Path
    performance_path: Path
    log_db_path:      Path
    min_results:      int
    max_results:      int
    # Reddit (PRAW) — optional. Agent skips Reddit source if any are missing.
    reddit_client_id:     str | None
    reddit_client_secret: str | None
    reddit_user_agent:    str | None
    # DataForSEO (real keyword volume/competition) — optional. Source skips
    # itself if login/password are missing.
    dataforseo_login:         str | None
    dataforseo_password:      str | None
    dataforseo_location_code: int
    dataforseo_language_code: str
    dataforseo_limit:         int

    @classmethod
    def from_env(cls, seeds_override: list[str] | None = None) -> "Config":
        _load_dotenv_if_present()
        return cls(
            seed_keywords    = seeds_override or _env_list("RESEARCH_SEED_KEYWORDS", DEFAULT_SEEDS),
            output_path      = _env_path("RESEARCH_OUTPUT_PATH", DEFAULT_OUTPUT_PATH),
            performance_path = _env_path("RESEARCH_PERFORMANCE_PATH", DEFAULT_PERFORMANCE_PATH),
            log_db_path      = _env_path("RESEARCH_LOG_DB_PATH", DEFAULT_LOG_DB_PATH),
            min_results      = _env_int("RESEARCH_MIN_RESULTS", DEFAULT_MIN_RESULTS),
            max_results      = _env_int("RESEARCH_MAX_RESULTS", DEFAULT_MAX_RESULTS),
            reddit_client_id     = os.environ.get("REDDIT_CLIENT_ID"),
            reddit_client_secret = os.environ.get("REDDIT_CLIENT_SECRET"),
            reddit_user_agent    = os.environ.get("REDDIT_USER_AGENT", "dna-seo-research/0.1"),
            dataforseo_login         = os.environ.get("DATAFORSEO_LOGIN"),
            dataforseo_password      = os.environ.get("DATAFORSEO_PASSWORD"),
            dataforseo_location_code = _env_int("DATAFORSEO_LOCATION_CODE", 2840),  # 2840 = United States
            dataforseo_language_code = os.environ.get("DATAFORSEO_LANGUAGE_CODE", "en"),
            dataforseo_limit         = _env_int("DATAFORSEO_LIMIT", 30),
        )

    def reddit_enabled(self) -> bool:
        return bool(self.reddit_client_id and self.reddit_client_secret and self.reddit_user_agent)

    def dataforseo_enabled(self) -> bool:
        return bool(self.dataforseo_login and self.dataforseo_password)
