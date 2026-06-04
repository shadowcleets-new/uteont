# Research Agent

Agent 1 in the pipeline. Discovers keyword opportunities from free signals
and writes a ranked `keywords.json` consumed by the Idea Generation Agent.

## Sources

| Source | Auth | Notes |
|---|---|---|
| **Google Trends** (pytrends) | none | Top + rising related queries per seed |
| **Wikipedia** (urllib + REST) | none | Related article titles per seed |
| **Reddit** (PRAW) | optional creds | Skipped if `REDDIT_*` env vars are unset |
| **DataForSEO** (Labs Keyword Suggestions) | optional creds | **Real** monthly search volume + competition + 12-month trend. Skipped if `DATAFORSEO_*` env vars are unset |

Every source is optional and fails independently — if one is unconfigured or
errors, the agent continues with whatever the others produced (just a log line).
When DataForSEO is configured its **real** search volume and competition override
the free-tool estimates for any keyword it surfaces.

## Install

From project root:

```
pip install -r agents/research_agent/requirements.txt
```

(Or just `pip install -r requirements.txt` — these deps are also in the
project-root requirements file.)

## Configuration (env vars only)

| Var | Default | Purpose |
|---|---|---|
| `RESEARCH_SEED_KEYWORDS` | `ai tools, content marketing, seo strategy` | Comma-separated seeds |
| `RESEARCH_OUTPUT_PATH`    | `agents/research_agent/output/keywords.json` | Output file |
| `RESEARCH_PERFORMANCE_PATH` | `contracts/performance.example.json` | Read for self-improvement loop |
| `RESEARCH_LOG_DB_PATH`    | `agents/research_agent/.data/runs.db` | SQLite run log |
| `RESEARCH_MIN_RESULTS`    | `10` | Run fails if fewer keywords produced |
| `RESEARCH_MAX_RESULTS`    | `50` | Cap on output rows |
| `REDDIT_CLIENT_ID`        | unset | Reddit app client ID (script type) |
| `REDDIT_CLIENT_SECRET`    | unset | Reddit app secret |
| `REDDIT_USER_AGENT`       | `dna-seo-research/0.1` | UA string |
| `DATAFORSEO_LOGIN`        | unset | DataForSEO API login (email). Enables the DataForSEO source |
| `DATAFORSEO_PASSWORD`     | unset | DataForSEO API password |
| `DATAFORSEO_LOCATION_CODE`| `2840` | Location code (2840 = United States) |
| `DATAFORSEO_LANGUAGE_CODE`| `en` | Language code |
| `DATAFORSEO_LIMIT`        | `30` | Max keyword suggestions fetched per seed |

Put credentials in a `.env` file at project root — `python-dotenv` loads
it automatically.

### Getting DataForSEO credentials

1. Sign up at https://app.dataforseo.com/register (pay-as-you-go; $50 minimum
   top-up, $1 free credits to test — see the pricing notes in the project docs).
2. Your API login + password are under **Dashboard → API Access** (the login is
   your email; the password is the API password shown there, NOT your portal
   password).
3. Set `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` on the worker host (Railway →
   Variables). Each research run uses Labs *Keyword Suggestions* (live) — roughly
   1–2¢ per seed. Set a spending limit in the DataForSEO dashboard for safety.

### Getting Reddit credentials

1. Go to https://www.reddit.com/prefs/apps and click "create another app…"
2. Pick **script** type
3. Fill name + redirect URI (`http://localhost:8080` is fine — unused)
4. The string under the app name is your `REDDIT_CLIENT_ID`; the secret is `REDDIT_CLIENT_SECRET`

## Run

```
python -m agents.research_agent.research_agent
python -m agents.research_agent.research_agent --seed "ai writing,llm tools"
python -m agents.research_agent.research_agent --output /tmp/kw.json --max-results 20
```

Successful run prints a JSON summary and writes `keywords.json` to the
configured path.

## Output schema (locked)

Each entry in `keywords.json`:

```json
{
  "keyword": "string",
  "search_volume_estimate": 0,
  "competition_score": 0.0,
  "source": "string",
  "timestamp": "2026-05-08T12:00:00+00:00",
  "priority_rank": 1
}
```

- `competition_score` ∈ [0.0, 1.0]. Lower = easier to rank.
- `source` is `+`-joined origin sources, e.g. `trends_rising+wikipedia`.
- `priority_rank` is 1-based. 1 = highest priority.

**Do not change this schema** without coordinating with the Idea Generation
Agent — it consumes this contract.

## Run log

Every run writes one row to `agents/research_agent/.data/runs.db`:
- `agent_name`, `started_at`, `finished_at`
- `action` (e.g. `discover_keywords`)
- `status` (`running` | `success` | `failure`)
- `result_json` — the summary or error

Inspect with the sqlite3 CLI:

```
sqlite3 agents/research_agent/.data/runs.db "SELECT id, started_at, status, action FROM agent_runs ORDER BY id DESC LIMIT 5"
```

## Self-improvement loop

If `contracts/performance.example.json` (or the path in
`RESEARCH_PERFORMANCE_PATH`) has cluster aggregates, the scoring step
adjusts competition based on past results:

- 3+ articles in a cluster failed to rank in 90 days → **+0.15 competition** (deprioritize)
- Cluster trending "rising" → **-0.10 competition** (boost)

Null tolerant — if a cluster has no signal, no adjustment is applied.

## Wired into the desktop app

The app's Research page invokes `agents.research_agent.research_agent.run`
on a background thread via the orchestrator's telemetry wrapper. The
agent's own SQLite log (this module) is separate from the app's telemetry
DB — both record every run, so neither is the single point of truth.
