"""AI Studio Controller — Playwright-based driver for Google AI Studio.

Standalone-testable:
    python browser_automation/ai_studio_controller.py --test

Programmatic use:
    python browser_automation/ai_studio_controller.py \
        --agent idea_generation --prompt "..."

This module is intentionally narrow: open Studio, apply parameters, submit one
prompt, return the response. Session persistence (cookies, login reuse) and
rate-limit pacing live in sibling modules and are NOT implemented here.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import yaml
from playwright.sync_api import (
    BrowserContext,
    Page,
    TimeoutError as PlaywrightTimeout,
    sync_playwright,
)

AI_STUDIO_URL = "https://aistudio.google.com/prompts/new_chat"
DEFAULT_NAV_TIMEOUT_MS = 60_000
LOGIN_WAIT_MS = 5 * 60_000
RESPONSE_STABLE_MS = 3_000
RESPONSE_MAX_WAIT_MS = 5 * 60_000

log = logging.getLogger("ai_studio_controller")


@dataclass
class GeminiParams:
    model: str
    thinking_level: str
    temperature: float
    top_p: float | None
    max_output_tokens: int | None

    @classmethod
    def from_yaml(cls, path: Path, agent: str) -> "GeminiParams":
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if "agents" not in data or agent not in data["agents"]:
            raise KeyError(f"agent '{agent}' not found in {path}")
        merged = {**data.get("defaults", {}), **data["agents"][agent]}
        temp = float(merged.get("temperature", 1.0))
        if temp != 1.0:
            log.warning(
                "temperature=%.2f for agent '%s' — Gemini 3 guidance is to keep it at 1.0; "
                "lowering degrades reasoning",
                temp,
                agent,
            )
        for required in ("model", "thinking_level"):
            if required not in merged:
                raise KeyError(f"agent '{agent}' missing required field '{required}'")
        return cls(
            model=str(merged["model"]),
            thinking_level=str(merged["thinking_level"]),
            temperature=temp,
            top_p=merged.get("top_p"),
            max_output_tokens=merged.get("max_output_tokens"),
        )


@dataclass
class StudioResponse:
    prompt: str
    response_text: str
    model: str
    thinking_level: str
    temperature: float
    duration_ms: int


def _load_selectors(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


class AIStudioController:
    """Single-prompt Playwright driver for AI Studio.

    Usage:
        with AIStudioController(params, selectors) as ctl:
            ctl.open_studio()
            ctl.apply_params()
            result = ctl.submit_prompt("...")
    """

    def __init__(
        self,
        params: GeminiParams,
        selectors: dict,
        storage_state: Path | None = None,
        headless: bool = False,
    ) -> None:
        self.params = params
        self.selectors = selectors
        self.storage_state = storage_state
        self.headless = headless
        self._pw = None
        self._browser = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None

    def __enter__(self) -> "AIStudioController":
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=self.headless)
        ctx_kwargs: dict = {}
        if self.storage_state and self.storage_state.exists():
            ctx_kwargs["storage_state"] = str(self.storage_state)
        self._context = self._browser.new_context(**ctx_kwargs)
        self._page = self._context.new_page()
        self._page.set_default_timeout(DEFAULT_NAV_TIMEOUT_MS)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        for closer in (self._context, self._browser):
            try:
                if closer:
                    closer.close()
            except Exception:
                log.exception("error closing browser resource")
        try:
            if self._pw:
                self._pw.stop()
        except Exception:
            log.exception("error stopping playwright")

    @property
    def page(self) -> Page:
        if self._page is None:
            raise RuntimeError("controller used outside `with` block")
        return self._page

    def open_studio(self) -> None:
        log.info("navigating to %s", AI_STUDIO_URL)
        self.page.goto(AI_STUDIO_URL, timeout=DEFAULT_NAV_TIMEOUT_MS)
        if "accounts.google.com" in self.page.url:
            log.warning(
                "sign-in required — complete login in the browser window "
                "(waiting up to %d seconds)",
                LOGIN_WAIT_MS // 1000,
            )
            self.page.wait_for_url(
                lambda u: "aistudio.google.com" in u, timeout=LOGIN_WAIT_MS
            )
        self.page.wait_for_load_state("networkidle", timeout=DEFAULT_NAV_TIMEOUT_MS)

    def apply_params(self) -> None:
        """Apply model + thinking_level + temperature + (optional) top_p / max_tokens."""
        sel = self.selectors
        page = self.page

        page.click(sel["model_dropdown"])
        page.click(sel["model_option"].format(model=self.params.model))

        page.click(sel["thinking_dropdown"])
        page.click(sel["thinking_option"].format(level=self.params.thinking_level))

        page.fill(sel["temperature_input"], str(self.params.temperature))

        if self.params.top_p is not None:
            page.fill(sel["top_p_input"], str(self.params.top_p))

        if self.params.max_output_tokens is not None:
            page.fill(sel["max_tokens_input"], str(self.params.max_output_tokens))

    def submit_prompt(self, prompt: str) -> StudioResponse:
        sel = self.selectors
        page = self.page
        start = time.monotonic()

        page.fill(sel["prompt_input"], prompt)
        page.click(sel["run_button"])
        text = self._wait_for_response()

        return StudioResponse(
            prompt=prompt,
            response_text=text,
            model=self.params.model,
            thinking_level=self.params.thinking_level,
            temperature=self.params.temperature,
            duration_ms=int((time.monotonic() - start) * 1000),
        )

    def _wait_for_response(self) -> str:
        sel = self.selectors
        page = self.page
        deadline = time.monotonic() + RESPONSE_MAX_WAIT_MS / 1000
        last_text = ""
        last_change = time.monotonic()
        saw_text = False
        while time.monotonic() < deadline:
            try:
                current = page.locator(sel["response_text"]).last.inner_text(timeout=2_000)
            except PlaywrightTimeout:
                current = ""
            if current:
                saw_text = True
            if saw_text and current == last_text:
                if (time.monotonic() - last_change) * 1000 >= RESPONSE_STABLE_MS:
                    return current
            else:
                last_text = current
                last_change = time.monotonic()
            time.sleep(0.5)
        raise TimeoutError(
            f"response did not stabilize within {RESPONSE_MAX_WAIT_MS // 1000}s"
        )


def _self_test(
    config_path: Path, selectors_path: Path, storage_state: Path | None
) -> int:
    params = GeminiParams.from_yaml(config_path, agent="self_test")
    selectors = _load_selectors(selectors_path)
    test_prompt = "Reply with exactly one word and nothing else: PONG"
    log.info(
        "self-test: model=%s thinking=%s temp=%.2f",
        params.model,
        params.thinking_level,
        params.temperature,
    )
    with AIStudioController(
        params, selectors, storage_state=storage_state, headless=False
    ) as ctl:
        ctl.open_studio()
        ctl.apply_params()
        result = ctl.submit_prompt(test_prompt)
    print(json.dumps(asdict(result), indent=2))
    if "PONG" in result.response_text.upper():
        log.info("self-test PASSED")
        return 0
    log.error("self-test FAILED — response did not contain PONG")
    return 1


def main() -> None:
    p = argparse.ArgumentParser(description="AI Studio controller (Playwright)")
    p.add_argument(
        "--config",
        type=Path,
        default=Path("configs/gemini_params.yaml"),
        help="path to gemini_params.yaml",
    )
    p.add_argument(
        "--selectors",
        type=Path,
        default=Path("browser_automation/selectors.yaml"),
        help="path to selectors.yaml",
    )
    p.add_argument(
        "--storage-state",
        type=Path,
        default=None,
        help="optional Playwright storage_state.json for cookie reuse",
    )
    p.add_argument("--test", action="store_true", help="run end-to-end self-test")
    p.add_argument(
        "--agent",
        default="self_test",
        help="which agent's params to apply (key in gemini_params.yaml)",
    )
    p.add_argument("--prompt", help="prompt text (required when not using --test)")
    p.add_argument("--log-level", default="INFO")
    args = p.parse_args()

    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.test:
        sys.exit(_self_test(args.config, args.selectors, args.storage_state))

    if not args.prompt:
        p.error("--prompt is required when --test is not set")

    params = GeminiParams.from_yaml(args.config, agent=args.agent)
    selectors = _load_selectors(args.selectors)
    with AIStudioController(params, selectors, storage_state=args.storage_state) as ctl:
        ctl.open_studio()
        ctl.apply_params()
        result = ctl.submit_prompt(args.prompt)
    print(json.dumps(asdict(result), indent=2))


if __name__ == "__main__":
    main()
