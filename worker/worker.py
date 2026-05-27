"""UTEONT browser worker — long-poll job queue, dispatch, report results.

Loop:
  1. POST /api/jobs/claim → get next job (or null)
  2. If null, sleep POLL_INTERVAL seconds
  3. If job, dispatch to handler keyed by job.agentKey
  4. POST /api/jobs/<id>/complete with result on success,
     /api/jobs/<id>/fail on exception

Run locally:
    pip install -r worker/requirements.txt
    export UTEONT_API_BASE=http://localhost:3000   # or prod URL
    export WORKER_SHARED_SECRET=<match-vercel>
    python worker/worker.py

Deployed: see worker/README.md (Railway / Fly / VPS / Vercel Sandbox).
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import time
from typing import Callable

# Make the agents/ subpackage importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api_client import ApiError, from_env  # noqa: E402

log = logging.getLogger("worker")

POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "5"))
DEFAULT_AGENT_KEYS = [
    "research",
    "idea-generation",
    "content-writing",
    "backlink",
]


# --- handlers --------------------------------------------------------

def handle_research(payload: dict) -> dict:
    from agents.research_agent.config import Config
    from agents.research_agent.research_agent import run

    # Payload overrides — single source of niche-specific control.
    # Accepted keys:
    #   seeds:      list[str] | comma-sep str  → overrides RESEARCH_SEED_KEYWORDS
    #   maxResults: int                         → cap on output rows
    #   minResults: int                         → min rows before considering run successful
    seeds_override: list[str] | None = None
    raw_seeds = payload.get("seeds")
    if isinstance(raw_seeds, list):
        seeds_override = [str(s).strip() for s in raw_seeds if str(s).strip()]
    elif isinstance(raw_seeds, str):
        seeds_override = [s.strip() for s in raw_seeds.split(",") if s.strip()]

    cfg = Config.from_env(seeds_override=seeds_override)
    if isinstance(payload.get("maxResults"), int):
        cfg.max_results = int(payload["maxResults"])
    if isinstance(payload.get("minResults"), int):
        cfg.min_results = int(payload["minResults"])

    log.info("research: seeds=%s max=%d min=%d",
             cfg.seed_keywords, cfg.max_results, cfg.min_results)
    return run(progress=lambda m: log.info("research: %s", m), cfg=cfg)


def handle_qa(payload: dict) -> dict:
    from agents.qa_agent.qa_agent import validate
    article = (payload.get("article") or "").strip()
    if not article:
        raise ValueError("qa requires 'article' in payload")
    return validate(
        article,
        target_keyword=payload.get("targetKeyword"),
        progress=lambda m: log.info("qa: %s", m),
    )


def handle_seo(payload: dict) -> dict:
    from agents.seo_optimization_agent.seo_agent import optimize
    article = (payload.get("article") or "").strip()
    if not article:
        raise ValueError("seo requires 'article' in payload")
    return optimize(
        article,
        target_keyword=payload.get("targetKeyword"),
        progress=lambda m: log.info("seo: %s", m),
    )


def handle_idea_generation(payload: dict) -> dict:
    from agents.idea_generation_agent.idea_agent import generate
    raw_keywords = payload.get("keywords")
    if isinstance(raw_keywords, str):
        keywords = [k.strip() for k in raw_keywords.split(",") if k.strip()]
    elif isinstance(raw_keywords, list):
        keywords = [str(k).strip() for k in raw_keywords if str(k).strip()]
    else:
        raise ValueError("idea-generation requires 'keywords' (list or comma-string) in payload")
    n = int(payload.get("nPerKeyword", 5))
    return generate(
        keywords,
        n_per_keyword=n,
        progress=lambda m: log.info("idea-gen: %s", m),
    )


def handle_content_writing(payload: dict) -> dict:
    from agents.content_writing_agent.content_agent import write
    title = str(payload.get("title") or "").strip()
    brief = str(payload.get("brief") or "").strip()
    if not title or not brief:
        raise ValueError("content-writing requires 'title' and 'brief' in payload")
    return write(
        title=title,
        brief=brief,
        target_keyword=payload.get("targetKeyword"),
        word_target=int(payload.get("wordTarget", 1200)),
        intent=payload.get("intent"),
        progress=lambda m: log.info("content: %s", m),
    )


def handle_outreach(payload: dict) -> dict:
    from agents.outreach_agent.outreach_agent import draft
    target_site = str(payload.get("targetSite") or "").strip()
    context = str(payload.get("context") or "").strip()
    our_value = str(payload.get("ourValue") or "").strip()
    if not (target_site and context and our_value):
        raise ValueError(
            "outreach requires 'targetSite', 'context', and 'ourValue' in payload"
        )
    return draft(
        target_site=target_site,
        context=context,
        our_value=our_value,
        target_email=payload.get("targetEmail"),
        our_article_url=payload.get("ourArticleUrl"),
        tone=str(payload.get("tone", "professional")),
        progress=lambda m: log.info("outreach: %s", m),
    )


HANDLERS: dict[str, Callable[[dict], dict]] = {
    "research":         handle_research,
    "qa":               handle_qa,
    "seo-optimization": handle_seo,
    "idea-generation":  handle_idea_generation,
    "content-writing":  handle_content_writing,
    "backlink":         handle_outreach,
}


# --- main loop -------------------------------------------------------

_stop = False


def _on_signal(signum, _frame):
    global _stop
    log.info("received signal %s — finishing current job and exiting", signum)
    _stop = True


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    signal.signal(signal.SIGINT, _on_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _on_signal)

    client = from_env()
    agent_keys = [k.strip() for k in
                  os.environ.get("WORKER_AGENTS", ",".join(DEFAULT_AGENT_KEYS)).split(",")
                  if k.strip()]
    log.info("worker '%s' starting — polling for agents=%s every %.1fs",
             client.worker_id, agent_keys, POLL_INTERVAL)

    while not _stop:
        try:
            job = client.claim_job(agent_keys)
        except ApiError as e:
            log.warning("claim failed: %s — backing off", e)
            time.sleep(min(60, POLL_INTERVAL * 6))
            continue

        if not job:
            time.sleep(POLL_INTERVAL)
            continue

        job_id = job["id"]
        agent_key = job["agentKey"]
        payload = job.get("payload") or {}
        log.info("claimed job %d for agent='%s'", job_id, agent_key)

        handler = HANDLERS.get(agent_key)
        if not handler:
            log.error("no handler for agent='%s'", agent_key)
            try:
                client.fail_job(job_id, f"no handler for '{agent_key}'", retry=False)
            except ApiError as e:
                log.error("fail report failed: %s", e)
            continue

        try:
            result = handler(payload)
            client.complete_job(job_id, result)
            log.info("job %d done", job_id)
        except Exception as e:
            log.exception("job %d failed", job_id)
            try:
                client.fail_job(job_id, f"{type(e).__name__}: {e}", retry=True)
            except ApiError as ae:
                log.error("fail report failed: %s", ae)

    log.info("worker exiting cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main())
