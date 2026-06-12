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


# NOTE: qa & seo-optimization now run inline on Vercel (TS ports in
# src/lib/agent-runners/{qa,seo-optimization}.ts). The registry routes them to
# the "fn" runtime, so the worker never receives those jobs — the old
# handle_qa/handle_seo handlers were dead and have been removed.


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
    "idea-generation":  handle_idea_generation,
    "content-writing":  handle_content_writing,
    "backlink":         handle_outreach,
}


# --- main loop -------------------------------------------------------

_stop = False
_health_state: dict = {
    "last_poll_at": None,
    "last_claim_at": None,
    "jobs_completed": 0,
    "jobs_failed": 0,
    "started_at": None,
}


def _on_signal(signum, _frame):
    global _stop
    log.info("received signal %s — finishing current job and exiting", signum)
    _stop = True


def _start_health_server(port: int = 8080) -> None:
    """F-024: tiny HTTP server so Railway / external monitors can detect
    worker death. Returns 200 + JSON snapshot of internal counters."""
    import http.server
    import json
    import socketserver
    import threading
    from datetime import datetime, timezone

    class _Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_a, **_kw):  # silence default access log
            pass
        def do_GET(self):
            if self.path == "/health":
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.end_headers()
                snap = dict(_health_state)
                snap["now"] = datetime.now(timezone.utc).isoformat()
                self.wfile.write(json.dumps(snap).encode())
                return
            self.send_response(404); self.end_headers()

    def _run():
        # A-16: bind localhost by default so the unauthenticated /health counters
        # snapshot isn't exposed on every interface. If the platform's health
        # probe is external (e.g. Railway), opt in with WORKER_HEALTH_HOST=0.0.0.0.
        host = os.environ.get("WORKER_HEALTH_HOST", "127.0.0.1")
        try:
            with socketserver.TCPServer((host, port), _Handler) as srv:
                log.info("health server listening on %s:%d/health", host, port)
                srv.serve_forever()
        except Exception as e:
            log.warning("health server failed to start: %s", e)

    threading.Thread(target=_run, daemon=True).start()


def main() -> int:
    from datetime import datetime, timezone
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    signal.signal(signal.SIGINT, _on_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _on_signal)

    _health_state["started_at"] = datetime.now(timezone.utc).isoformat()
    if os.environ.get("WORKER_HEALTH_PORT", "8080"):
        _start_health_server(int(os.environ.get("WORKER_HEALTH_PORT", "8080")))

    client = from_env()
    agent_keys = [k.strip() for k in
                  os.environ.get("WORKER_AGENTS", ",".join(DEFAULT_AGENT_KEYS)).split(",")
                  if k.strip()]
    log.info("worker '%s' starting — polling for agents=%s every %.1fs",
             client.worker_id, agent_keys, POLL_INTERVAL)

    while not _stop:
        from datetime import datetime, timezone
        _health_state["last_poll_at"] = datetime.now(timezone.utc).isoformat()
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
        attempts = int(job.get("attempts") or 0)
        log.info("claimed job %d for agent='%s' (attempt %d)", job_id, agent_key, attempts)
        _health_state["last_claim_at"] = datetime.now(timezone.utc).isoformat()

        handler = HANDLERS.get(agent_key)
        if not handler:
            log.error("no handler for agent='%s'", agent_key)
            try:
                client.fail_job(job_id, f"no handler for '{agent_key}'", retry=False)
            except ApiError as e:
                log.error("fail report failed: %s", e)
            _health_state["jobs_failed"] += 1
            continue

        # A-04: run the handler and report completion as SEPARATE steps. Only a
        # handler exception should mark the job failed + retry. A failure to
        # REPORT a successful completion must NOT call fail_job — the server may
        # have already committed the result, and re-queuing would duplicate the
        # work. (The server's completeJob is idempotent too, so a later retry is
        # a safe no-op.)
        try:
            result = handler(payload)
        except Exception as e:
            log.exception("job %d failed", job_id)
            _health_state["jobs_failed"] += 1
            # F-025: exponential backoff before re-claiming on transient
            # failures. attempts=N → wait 2^N * 5s (capped at 5 min) so
            # an overloaded downstream isn't hammered.
            backoff_s = min(300, 5 * (2 ** attempts))
            log.info("backing off %ds before next poll (attempt was %d)", backoff_s, attempts)
            try:
                client.fail_job(job_id, f"{type(e).__name__}: {e}", retry=True)
            except ApiError as ae:
                log.error("fail report failed: %s", ae)
            # Sleep the exponential backoff so the next claim doesn't
            # immediately re-pull this job (it's now back to status=queued
            # via fail_job retry=True).
            time.sleep(backoff_s)
            continue

        try:
            client.complete_job(job_id, result)
            log.info("job %d done", job_id)
            _health_state["jobs_completed"] += 1
        except ApiError as e:
            # Handler succeeded; only the completion report failed. Do NOT
            # fail_job (that would resurrect a possibly-committed job). The
            # job stays 'claimed' and a reclaim re-reports completion, which
            # the idempotent server collapses to a no-op.
            log.error("job %d completed but the completion report failed: %s", job_id, e)
            _health_state["jobs_completed"] += 1

    log.info("worker exiting cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main())
