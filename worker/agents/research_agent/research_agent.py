"""Research Agent — main entrypoint.

Discovers keyword opportunities from free signals (Google Trends, Wikipedia,
optional Reddit), scores them, writes keywords.json. Logs each run to SQLite.

CLI:
    python -m agents.research_agent.research_agent
    python -m agents.research_agent.research_agent --seed "ai tools,seo"
    python -m agents.research_agent.research_agent --output /tmp/keywords.json

Programmatic (used by the desktop app's runner):
    from agents.research_agent.research_agent import run
    result = run(progress=print)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Callable

from agents.research_agent.config import Config
from agents.research_agent.logger import RunLogger
from agents.research_agent.models import KeywordResult, RawSignal
from agents.research_agent.scoring import merge_and_rank
from agents.research_agent.sources import all_sources

log = logging.getLogger("agents.research")

ProgressFn = Callable[[str], None]


def _no_progress(_msg: str) -> None:
    pass


def _collect_signals(cfg: Config, progress: ProgressFn) -> list[RawSignal]:
    signals: list[RawSignal] = []
    sources = all_sources(cfg)
    for seed in cfg.seed_keywords:
        for src in sources:
            progress(f"{src.name}: querying '{seed}'")
            try:
                got = src.discover(seed)
                signals.extend(got)
                progress(f"{src.name}: got {len(got)} signals for '{seed}'")
            except Exception as e:
                log.exception("%s failed for '%s'", src.name, seed)
                progress(f"{src.name}: FAILED for '{seed}' ({e})")
    return signals


def _write_output(results: list[KeywordResult], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = [r.to_dict() for r in results]
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def run(progress: ProgressFn = _no_progress, cfg: Config | None = None) -> dict:
    """Run the Research Agent end-to-end. Returns a summary dict.

    Designed to be called from a CLI or from the desktop app's runner.
    Raises ValueError if minimum keyword count isn't met.
    """
    cfg = cfg or Config.from_env()
    run_logger = RunLogger(cfg.log_db_path)
    run_id = run_logger.start("discover_keywords")
    progress(
        f"config: {len(cfg.seed_keywords)} seed(s), "
        f"reddit={'on' if cfg.reddit_enabled() else 'off'}, "
        f"output={cfg.output_path}"
    )

    try:
        signals = _collect_signals(cfg, progress)
        progress(f"scoring {len(signals)} raw signals")
        results = merge_and_rank(
            signals,
            performance_path=cfg.performance_path,
            max_results=cfg.max_results,
        )

        if len(results) < cfg.min_results:
            msg = (
                f"only {len(results)} keywords passed scoring; need at least "
                f"{cfg.min_results}. Add more seeds via RESEARCH_SEED_KEYWORDS "
                f"or --seed."
            )
            run_logger.finish(run_id, "failure", {"error": msg, "got": len(results)})
            raise ValueError(msg)

        progress(f"writing {len(results)} keywords to {cfg.output_path}")
        _write_output(results, cfg.output_path)

        summary = {
            "run_id": run_id,
            "keyword_count": len(results),
            "output_path": str(cfg.output_path),
            "top_keyword": results[0].keyword if results else None,
            "top_keywords": [r.keyword for r in results[:5]],
            "seeds_used": cfg.seed_keywords,
            "reddit_enabled": cfg.reddit_enabled(),
        }
        run_logger.finish(run_id, "success", summary)
        progress(
            f"done — {len(results)} keywords, top: {summary['top_keyword']!r}"
        )
        return summary
    except ValueError:
        raise
    except Exception as e:
        log.exception("research run failed")
        run_logger.finish(run_id, "failure", {"error": f"{type(e).__name__}: {e}"})
        raise


# --- CLI -----------------------------------------------------------------

def _cli() -> int:
    p = argparse.ArgumentParser(description="Research Agent — free-API keyword discovery")
    p.add_argument(
        "--seed",
        help="Comma-separated seed keywords (overrides RESEARCH_SEED_KEYWORDS)",
    )
    p.add_argument(
        "--output",
        type=Path,
        help="Output path for keywords.json (overrides RESEARCH_OUTPUT_PATH)",
    )
    p.add_argument(
        "--min-results",
        type=int,
        help="Minimum keywords required to consider the run successful",
    )
    p.add_argument(
        "--max-results",
        type=int,
        help="Cap the number of keywords written to the output file",
    )
    p.add_argument("--quiet", action="store_true", help="Suppress progress output")
    p.add_argument("--log-level", default="INFO")
    args = p.parse_args()

    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    seeds_override = None
    if args.seed:
        seeds_override = [s.strip() for s in args.seed.split(",") if s.strip()]

    cfg = Config.from_env(seeds_override=seeds_override)
    if args.output:
        cfg.output_path = args.output
    if args.min_results:
        cfg.min_results = args.min_results
    if args.max_results:
        cfg.max_results = args.max_results

    progress = (lambda _m: None) if args.quiet else (lambda m: print(f"[research] {m}"))

    try:
        result = run(progress=progress, cfg=cfg)
    except ValueError as e:
        print(f"FAILED: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"FAILED: {type(e).__name__}: {e}", file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
