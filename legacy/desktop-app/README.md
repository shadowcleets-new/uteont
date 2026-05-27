# UTEONT — Legacy desktop app archive

This folder preserves the original **PySide6 desktop app** that was the
first incarnation of UTEONT before the pivot to a Vercel-hosted
Next.js web app + Railway-hosted Python worker.

**This code is no longer maintained.** It's preserved here because:

- The agent logic (research, QA, SEO) was written here first and the
  current `worker/agents/*` Python modules trace their lineage to these
  files. Helpful as a reference / blame-history target.
- The Qt-based UI represents a different UX direction (offline-first,
  single-binary) that may be worth revisiting if the web architecture
  ever doesn't fit.
- It's working code that ran end-to-end on a Windows machine — non-zero
  asset value, near-zero archival cost.

The active production code lives at the repo root (`src/`, `worker/`).
**Do not import from `legacy/`.**

## What's here

```
legacy/desktop-app/
├── README.md                 (this file)
├── .env.example              Desktop-era env template (Reddit + research config)
├── requirements.txt          Python deps for the desktop app:
│                               playwright==1.48.0
│                               PyYAML==6.0.2
│                               PySide6==6.10.3
├── run_app.bat               Windows launcher (cd's to script dir → python -m app)
├── configs/
│   └── gemini_params.yaml    Per-agent Gemini params for the AI Studio
│                             browser-automation flow (superseded by the
│                             Gemini HTTP API in worker/agents/_gemini.py)
└── app/                      Qt desktop application package
    ├── __init__.py
    ├── __main__.py             python -m app entry point
    ├── main.py                 QApplication bootstrap + theme application
    ├── main_window.py          Sidebar nav + stacked pages + log dock
    ├── log_bus.py              Python logging → Qt signal bridge
    ├── telemetry.py            SQLite-backed agent-run telemetry
    ├── theme.py                Anthropic brand palette + QSS
    ├── workers.py              QThread worker helpers + telemetry wrapper
    ├── agents.py               10-agent registry (AgentSpec dataclass)
    ├── README.md               Original desktop-app README
    ├── pages/                  One file per sidebar destination
    │   ├── base.py             AppPage base class
    │   ├── dashboard.py        Agents-at-a-glance grid
    │   ├── agent_page.py       Generic per-agent page (renders any AgentSpec)
    │   ├── ai_studio.py        AI Studio controller test page (legacy)
    │   ├── session.py          Session capture / verify / invalidate (legacy)
    │   ├── pacing.py           Pacing self-test runner (legacy)
    │   ├── settings.py         Persistent QSettings-backed prefs
    │   └── __init__.py         Page registry (sections)
    └── widgets/
        └── article_input.py    Shared markdown + target-keyword input
                                (used by QA and SEO Opt agent pages)
```

## Mapping to current code

| Desktop concept | Current equivalent |
|---|---|
| `app/main_window.py` (Qt shell) | `src/app/layout.tsx` (Next.js root layout) |
| `app/pages/dashboard.py` | `src/app/page.tsx` |
| `app/pages/agent_page.py` (parameterized) | `src/app/agents/[key]/page.tsx` |
| `app/telemetry.py` (SQLite-local) | `src/lib/services/runs.ts` + Postgres `runs` table |
| `app/agents.py` (Python AgentSpec) | `src/lib/agents/registry.ts` (TS AgentSpec) |
| `app/workers.py` (QThread worker) | `src/lib/services/jobs.ts` + worker queue pattern |
| `app/theme.py` (QSS) | `src/lib/theme.ts` + `src/app/globals.css` |
| `app/widgets/article_input.py` | inputs handled per-route in current UI |
| `configs/gemini_params.yaml` (AI Studio params) | `worker/agents/_gemini.py` (HTTP API, no params file) |
| `app/pages/{ai_studio,session,pacing}.py` | obsolete — Gemini API path replaced AI Studio |

## How it ran

From the `legacy/desktop-app/` directory (not the active repo root):

```
pip install -r requirements.txt
playwright install chromium --with-deps   # for the AI Studio path
python -m app                              # launches the Qt window
```

`run_app.bat` does the same on Windows with one double-click.

## Why we pivoted

The web app + worker architecture wins for:

- Multi-device access (laptop, phone) via uteont.vercel.app
- Vercel auto-deploy on `git push`
- No "must keep this machine on" requirement for the orchestrator
- Easier to expose approval webhooks (the worker doesn't need to be the UI host)

The desktop app wins for:

- Faster local dev iteration (no deploy step)
- Native widgets, no browser overhead
- Operates without any internet connectivity (assuming all agent inputs are local)

If we ever go offline-first or want a more native experience, this code is the starting point.
