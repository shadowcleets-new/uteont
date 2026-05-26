"""Job poller — picks queued work from Postgres, runs it, writes results back.

Not yet implemented — this file is a placeholder so the structure is visible.
Implementation lands in the next phase after Vercel + DB are provisioned.

Sketch:

    import os, time, psycopg
    from agents.research_agent.research_agent import run as research_run
    from agents.qa_agent.qa_agent import validate as qa_validate
    from agents.seo_optimization_agent.seo_agent import optimize as seo_optimize

    HANDLERS = {
        "research":         lambda payload: research_run(),
        "qa":               lambda payload: qa_validate(**payload),
        "seo-optimization": lambda payload: seo_optimize(**payload),
        # browser-driven agents (idea-generation, content-writing) will
        # additionally call browser_automation.ai_studio_controller
    }

    def main():
        url = os.environ["DATABASE_URL"]
        while True:
            with psycopg.connect(url) as conn:
                job = claim_one(conn)
                if not job:
                    time.sleep(5)
                    continue
                run_job(conn, job)

    if __name__ == "__main__":
        main()

See worker/README.md for deployment options.
"""

if __name__ == "__main__":
    raise SystemExit(
        "worker.py is not yet implemented — see the module docstring for the "
        "intended shape. Lands in the next phase after Vercel + DB bootstrap."
    )
