# browser_automation

Playwright-based driver for Google AI Studio. The orchestrator uses this layer
to send prompts to **Gemini 3.1 Pro** via the browser (no API).

Three modules, each independently runnable:

- `ai_studio_controller.py` — opens AI Studio, applies parameters, sends
  one prompt, returns the response.
- `session_manager.py` — captures and reuses Google login state via
  Playwright's `storage_state.json`, so the controller can run unattended.
- `pacing.py` — human-like delays + rate-limit detection and cooldown.
  Pure-Python (no browser dependency); detection takes plain page text.

## Setup

1. Install dependencies (from project root):

   ```
   pip install -r requirements.txt
   playwright install chromium --with-deps
   ```

   Playwright 1.48.0 bundles **Chromium 130**. If selectors break later,
   first check whether Chromium has updated — that's a common confounder
   when AI Studio's UI also changes.

2. First-run login. The browser launches headed (visible) so you can sign
   in manually:

   ```
   python browser_automation/ai_studio_controller.py --test
   ```

   The controller waits up to 5 minutes for you to complete sign-in, then
   continues into the self-test.

3. Capture a reusable session (one-time, interactive):

   ```
   python -m browser_automation.session_manager --capture
   ```

   Saves to `browser_automation/.session/storage_state.json`. Pass that
   path to the controller via `--storage-state` to skip login on
   subsequent runs.

4. Verify a saved session is still valid (headless):

   ```
   python -m browser_automation.session_manager --verify
   ```

   Returns exit 0 if AI Studio loads without redirecting to the
   accounts.google.com login flow, exit 1 otherwise. If 1, run
   `--capture` again to refresh.

## Module: `ai_studio_controller.py`

End-to-end single-prompt cycle: opens AI Studio → applies parameters from
`configs/gemini_params.yaml` → submits a prompt → returns the response as JSON.

### CLI

| Flag              | Purpose                                                        |
|-------------------|----------------------------------------------------------------|
| `--test`          | Run the self-test (sends a known prompt, verifies the reply)   |
| `--config`        | Path to `gemini_params.yaml` (default `configs/gemini_params.yaml`) |
| `--selectors`     | Path to `selectors.yaml` (default `browser_automation/selectors.yaml`) |
| `--agent`         | Which agent's params to apply (`self_test`, `idea_generation`, ...) |
| `--prompt`        | Prompt text (required when `--test` is not set)                |
| `--storage-state` | Optional Playwright `storage_state.json` for cookie reuse      |
| `--log-level`     | `DEBUG` / `INFO` / `WARNING`                                   |

### Output (stdout)

```json
{
  "prompt": "...",
  "response_text": "...",
  "model": "Gemini 3.1 Pro",
  "thinking_level": "low",
  "temperature": 1.0,
  "duration_ms": 12345
}
```

### Self-test

```
python browser_automation/ai_studio_controller.py --test
```

Submits `Reply with exactly one word and nothing else: PONG` and exits 0 if
the response contains `PONG`. **This must pass before any agent is built on
top of this module.**

## Selectors

`selectors.yaml` holds every AI Studio DOM selector. They are best-effort
placeholders and **must be calibrated on first run**. The .py module never
hardcodes a selector — repairs always go in the YAML.

To repair, run with the Playwright Inspector:

```
PWDEBUG=1 python browser_automation/ai_studio_controller.py --test
```

Inspector pauses on each action so you can copy a working selector. Prefer
`role=`, `aria-label`, and `:has-text(...)` over CSS classes — AI Studio
churns class names on most deploys.

## Module: `session_manager.py`

Owns the `storage_state.json` lifecycle. The controller never writes to it —
`session_manager` is the single owner.

### CLI

| Flag             | Purpose                                                    |
|------------------|------------------------------------------------------------|
| `--capture`      | Open headed browser, wait for manual login, save state     |
| `--verify`       | Headless load AI Studio with saved state; check we're in   |
| `--invalidate`   | Delete the saved state (call after an auth failure)        |
| `--storage-path` | Override default location of `storage_state.json`          |

### Default location

`browser_automation/.session/storage_state.json` (created on first capture).

### Flow

```
session_manager --capture        # one-time, headed, manual login
        │
        ▼
storage_state.json
        │
        ├──▶ session_manager --verify   # cron-friendly, headless health check
        │
        └──▶ ai_studio_controller --storage-state <path>   # unattended runs
```

If `--verify` fails, the orchestrator should `--invalidate` and prompt a
human to re-run `--capture`. Never retry login programmatically — that's how
sessions get flagged.

## Module: `pacing.py`

Two independent pieces plus a smoke test. No browser dependency — easy to
unit-test, easy to wire in from anywhere.

### `HumanPacing`

Jittered Gaussian delays per action (`click` / `type` / `submit` / `navigate`),
floored at 50ms.

```python
from browser_automation.pacing import HumanPacing
HumanPacing().sleep("click")
```

### `RateLimitDetector` + `Cooldown`

```python
from browser_automation.pacing import RateLimitDetector, Cooldown

info = RateLimitDetector().check(page.content())
if info:
    Cooldown(notifier=telegram_notify).wait(info)
    # caller decides whether to resume — pacing never retries blindly
```

Detector is a substring match (case-insensitive) against `RATE_LIMIT_SIGNALS`.
Update that tuple as new AI Studio quota / error copy is observed in the wild —
same calibration discipline as `selectors.yaml`.

`Cooldown.wait` clamps to `MAX_COOLDOWN_S` (1 hour) and ALWAYS calls the
notifier before sleeping. If the notifier raises, cooldown still proceeds —
sleeping is the safety property; the notification is best-effort.

### Smoke test

```
python -m browser_automation.pacing --test
```

Pure-Python — no browser, no real sleeps. Verifies pacing draws, detector
hits/misses, cooldown clamping + notifier invocation.

## Constraints (whole layer)

- **Temperature is locked to 1.0** per Gemini 3 guidance. Any agent config
  with a different value logs a warning. Lower temperatures degrade Gemini 3
  reasoning.
- **One prompt per controller lifetime.** Re-enter the `with` block for the
  next prompt (cheap once a saved storage state exists).
- **No retries on rate limit.** `Cooldown.wait` pauses + notifies + sleeps +
  returns. The orchestrator decides whether to attempt the next action.
- **No Telegram client in this layer.** `Cooldown` accepts a notifier
  callable; the Telegram wiring lives in `integrations/telegram_bot.py`
  (built later).
- **No screenshot or audit logging here.** Orchestrator concern.

## What good looks like before stacking content agents

1. `python browser_automation/ai_studio_controller.py --test` exits 0.
2. `selectors.yaml` has been calibrated against the live AI Studio UI.
3. `python -m browser_automation.session_manager --capture` produces a
   working `storage_state.json`.
4. `python -m browser_automation.session_manager --verify` exits 0
   (headless) — proves unattended runs are viable.
5. `python -m browser_automation.pacing --test` exits 0.
6. End-to-end: `ai_studio_controller --test --storage-state <captured path>`
   completes without manual login.

Hit all six before any agent in the pipeline calls into this layer.
