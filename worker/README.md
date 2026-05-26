# UTEONT Browser Worker

The Python + Playwright worker that handles everything Vercel can't:
- Long-running content generation via AI Studio (Gemini 3.1 Pro)
- Idea generation, content writing, outreach drafting
- Research Agent's pytrends queries (also runs here for now)

This is a **separate deployment** from the Vercel-hosted frontend. It
polls the `jobs` table in shared Postgres and writes results back.

## Local dev

```bash
cd worker
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
playwright install chromium --with-deps

# Capture an AI Studio session (one-time, interactive)
python -m browser_automation.session_manager --capture

# Run a job poller (TODO — implementation in next phase)
python worker.py
```

## What's in here (today)

| Path | What | Status |
|---|---|---|
| `agents/research_agent/` | Research Agent — pytrends + Wikipedia + opt. PRAW | ✅ works standalone |
| `agents/qa_agent/` | QA / Validation Agent — pure-Python checks | ✅ works standalone |
| `agents/seo_optimization_agent/` | SEO Optimization Agent — markdown SEO lint | ✅ works standalone |
| `browser_automation/` | Playwright driver for AI Studio | ✅ controller works; selectors need calibration on first run |
| `worker.py` | Job poller (Postgres → run agent → write result) | ⏳ next phase |

Each agent has its own README.

## Deployment options

| Host | Why | Cost |
|---|---|---|
| **Railway** | Easiest — Dockerfile or buildpack, point to repo | Free tier OK for start; $5/mo Hobby |
| **Fly.io** | Most flexible — `fly launch`, scale to zero | Free tier OK |
| **Hetzner VPS** | Cheapest long-term, always-on | ~$4/mo |
| **Vercel Sandbox / Fluid Compute** | Stay on Vercel, but caveats around session length | TBD |

Pick one when the worker.py poller lands. For now this directory holds
the agent code so it can be tested locally and is committed to the same
repo as the frontend.

## Required environment

```env
DATABASE_URL=postgres://...          # shared with Vercel
WORKER_SHARED_SECRET=...             # match Vercel's value
REDDIT_CLIENT_ID=...                 # optional, Research only
REDDIT_CLIENT_SECRET=...
REDDIT_USER_AGENT=uteont-research/0.1
```

## Calibrating AI Studio selectors

Selectors in `browser_automation/selectors.yaml` are best-guess placeholders.
On first deployment:

```bash
PWDEBUG=1 python browser_automation/ai_studio_controller.py --test
```

Update `selectors.yaml` when a step fails. Commit and redeploy.
