# app/ — Desktop orchestrator

PySide6 (Qt) desktop app for UTEONT — the multi-agent SEO system. Foundation
designed for incremental extension — add an agent later by dropping a
single file into `app/pages/`.

## Run

From project root:

```
pip install -r requirements.txt
playwright install chromium --with-deps    # if not already done
python -m app
```

Or double-click `run_app.bat` on Windows.

## Layout

```
app/
├── __main__.py        # `python -m app` entry
├── main.py            # builds QApplication + MainWindow + applies theme
├── main_window.py     # sectioned sidebar + stacked pages + log dock
├── theme.py           # Anthropic brand colors + typography + global QSS
├── log_bus.py         # bridges Python logging into Qt signals
├── workers.py         # QThread worker helper + telemetry wrapper
├── telemetry.py       # SQLite-backed run log + Qt signals + stats
├── agents.py          # registry of all 10 agents (AgentSpec list)
└── pages/
    ├── __init__.py    # SECTIONS layout — OVERVIEW / AGENTS / INFRA / SETTINGS
    ├── base.py        # AppPage subclass parent
    ├── dashboard.py   # agents-at-a-glance grid + system health
    ├── agent_page.py  # generic page rendered per AgentSpec
    ├── session.py     # capture / verify / invalidate (telemetered)
    ├── ai_studio.py   # controller test + custom prompt (telemetered)
    ├── pacing.py      # pacing self-test (telemetered)
    └── settings.py    # persistent paths + log level (QSettings)
```

## Sidebar sections

```
OVERVIEW
  Dashboard

AGENTS
  1. Research
  2. Idea Generation
  3. Content Writing
  4. QA / Validation
  5. SEO Optimization
  6. Technical SEO
  7. Publishing
  8. Backlink / Outreach
  9. Performance Tracking
  10. Revenue Optimization

INFRASTRUCTURE
  Session
  AI Studio
  Pacing

SETTINGS
  Settings
```

Each agent page shows: status pill, description, "Currently working on"
panel, statistics (total runs / success rate / total time / avg / last run),
recent runs table, and a logs feed filtered to that agent's logger prefix.

## Telemetry

Every agent run and every infrastructure operation logs a row to
`app/.data/telemetry.db` (SQLite). The schema:

```
task_runs(id, subject_key, category, action,
          started_at, finished_at, status, result_json)
```

- `subject_key` — `agent.<key>` for agents, `infra.<name>` for tooling
- `category` — `agent` or `infra`
- `status` — `running` | `success` | `failure`

Stats and recent-runs views query this table directly. Live status
updates flow through `Telemetry.run_started` / `run_finished` signals
emitted on every state change. UI never polls.

## Wiring an agent's runner

`app/agents.py` defines all 10 agents with `runner=None`. To enable one:

```python
def research_runner(progress):
    progress("loading seed keywords")
    # ... real work, using logging.getLogger("agents.research").info(...)
    progress("scoring keywords")
    return {"summary": "...", "keywords_found": 42}

AgentSpec(
    key="research",
    name="Research Agent",
    sidebar_label="1. Research",
    description="...",
    runner=research_runner,
)
```

Once `runner` is non-None:
- The Run button enables on the agent page
- The status pill flips from "Planned" to "Idle"
- Runs are tracked in telemetry automatically
- Logs from `agents.research*` stream into the agent's filtered log feed

## Theme

`app/theme.py` is the single source of truth for visual styling. All
colors, fonts, pill states, and the application-wide Qt stylesheet
(QSS) live there.

**Brand palette** (Anthropic guidelines):
- `dark #141413` · `light #faf9f5` · `mid_gray #b0aea5` · `light_gray #e8e6dc`
- accents: `orange #d97757` · `blue #6a9bcc` · `green #788c5d`

**Typography**:
- Headings & UI chrome: **Poppins** (fallback Arial)
- Body / descriptive prose: **Lora** (fallback Georgia)
- Logs / monospace: **Consolas** (fallback Menlo / Courier)

**Helpers** (use these instead of inline hex):
- `pill_style(state)` — returns CSS for a status pill (Idle / Running /
  Success / Failed / Planned)
- `card_qss(hover_accent=True)` — clickable-card stylesheet
- `description_qss()` — long-form description block style (Lora)
- `heading_font(size, weight)` / `body_font(size)` / `mono_font(size)` — `QFont` helpers
- `apply_theme(qt_app)` — installs the global QSS + sets default app font

To restyle: edit `theme.py`. Pages should never hardcode hex values.

## Architecture notes

- **Threading.** Every long-running operation (browser session capture, a
  controller call, a research run) goes through `app.workers.run_in_thread`.
  The UI never blocks. Workers emit `finished(result)` or `failed(msg)`.
  The page holds a strong ref to the `JobHandle` so neither thread nor
  worker is garbage-collected mid-flight.

- **Logging.** `app.log_bus.install_log_bus()` adds a handler that
  forwards every `logging` record to a Qt signal. The bottom `LogDock`
  subscribes to that signal. Any module — including future agents —
  that uses standard Python logging shows up automatically. **Don't**
  wire log widgets per page; the dock is global.

- **Lazy imports of `browser_automation/*`.** Pages import `browser_automation`
  modules inside button handlers, not at the top of the file. This means
  the app launches even if Playwright isn't installed yet — the failure
  surfaces only when the user clicks the button that needs it. Stick to
  this pattern for any new optional dep.

- **State persistence.** Window geometry, dock state, splitter sizes,
  and Settings page values persist via `QSettings`. On Windows that's
  the registry under `HKCU\Software\UTEONT\UTEONT`.

- **Thread safety with Playwright.** Playwright's sync API is fine on a
  non-main thread as long as the same thread that called `sync_playwright().start()`
  also drives the browser. Our worker pattern satisfies this — each
  long op runs entirely on its own QThread.

## What this app intentionally does NOT do

- **No subprocess shelling.** It calls `browser_automation` modules
  directly via Python imports. That makes them unit-testable and avoids
  parsing CLI output.
- **No agent orchestration logic.** Each page wires one or two
  subsystem operations. Cross-agent flow control belongs in a separate
  orchestrator module (still vapor as of this build).
- **No tray icon, no auto-update, no system service mode.** Those are
  later concerns — the foundation supports adding them without rework.

## Smoke test

After `pip install` + `playwright install chromium`:

```
python -m app
```

You should see a window with five sidebar entries (Dashboard, Session,
AI Studio, Pacing, Settings) and a bottom log dock that prints "application
started — 5 page(s) registered". Click Pacing → "Run pacing test" — it
runs without a browser and prints a JSON result with `"passed": true`.
