"""NotebookLM controller (LO-63).

Repurposes the AI-Studio Playwright + persistent-session pattern
(session_manager.py, ai_studio_controller.py) to drive a NotebookLM browser
session: given a video / podcast / Reel URL, it adds the URL as a NotebookLM
source and captures NotebookLM's own tactic-extraction summary, which is then
ingested into the `tactics` table with source_type='notebooklm-derived'.

Hard constraint (LO-63): ZERO Gemini API calls on this path. All video/audio
understanding happens inside the NotebookLM browser session — preserving the
Gemini API quota the rest of the pipeline depends on.

This module needs the worker host + an authenticated NotebookLM session
(storage_state); it is browser-only and is exercised with a mocked Page in
tests. NotebookLM's DOM is not a stable public API — selectors are isolated in
NOTEBOOKLM_SELECTORS so they can be patched without touching the flow.

Programmatic:
    from browser_automation.notebooklm_controller import extract_tactics
    result = extract_tactics("https://youtu.be/...", storage_state=Path("nlm.json"))
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

log = logging.getLogger("browser.notebooklm")

NOTEBOOKLM_URL = "https://notebooklm.google.com/"
DEFAULT_NAV_TIMEOUT_MS = 60_000
SUMMARY_POLL_TIMEOUT_S = 180

ProgressFn = Callable[[str], None]

# Isolated so a NotebookLM UI change is a one-place patch (not a public API).
NOTEBOOKLM_SELECTORS = {
    "new_notebook": "button:has-text('New notebook')",
    "add_source": "button:has-text('Add source')",
    "source_url_tab": "button:has-text('Website'), button:has-text('YouTube'), button:has-text('Link')",
    "source_url_input": "input[type='url'], input[placeholder*='URL']",
    "source_submit": "button:has-text('Insert'), button:has-text('Add')",
    "summary_prompt": "textarea[placeholder*='Ask'], textarea[aria-label*='question']",
    "summary_send": "button[aria-label*='Send'], button:has-text('Send')",
    "summary_response": "[data-message-author='model'], .response-content, .message-content",
}

# The instruction typed into NotebookLM's chat — extraction happens in-session.
EXTRACTION_PROMPT = (
    "From this source, extract the concrete, actionable marketing/SEO tactics. "
    "For each tactic give a short title and a 1-3 sentence description of how to "
    "apply it. Return a plain list — no preamble."
)


def _no_progress(_msg: str) -> None:
    pass


@dataclass
class NotebookLMResult:
    source_url: str
    title: str
    body: str
    ok: bool
    error: str | None = None

    def as_tactic(self) -> dict:
        return {
            "sourceUrl": self.source_url,
            "sourceType": "notebooklm-derived",
            "title": self.title[:300],
            "body": self.body[:4000],
            "tags": ["notebooklm"],
            "score": None,
        }


class NotebookLMController:
    """Playwright driver for one NotebookLM source-extraction session."""

    def __init__(
        self,
        storage_state: Path | None = None,
        headless: bool = False,
    ) -> None:
        self.storage_state = storage_state
        self.headless = headless
        self._pw = None
        self._browser = None
        self._context = None
        self._page = None

    def __enter__(self) -> "NotebookLMController":
        from playwright.sync_api import sync_playwright  # lazy — heavy import

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
    def page(self):
        if self._page is None:
            raise RuntimeError("controller used outside `with` block")
        return self._page

    def run(self, source_url: str, progress: ProgressFn = _no_progress) -> NotebookLMResult:
        page = self.page
        try:
            progress("opening NotebookLM")
            page.goto(NOTEBOOKLM_URL, timeout=DEFAULT_NAV_TIMEOUT_MS)
            if "accounts.google.com" in (page.url or ""):
                return NotebookLMResult(source_url, "", "", False, "not signed in (storage_state missing/expired)")

            progress("creating notebook + adding source")
            page.click(NOTEBOOKLM_SELECTORS["new_notebook"])
            page.click(NOTEBOOKLM_SELECTORS["add_source"])
            page.click(NOTEBOOKLM_SELECTORS["source_url_tab"])
            page.fill(NOTEBOOKLM_SELECTORS["source_url_input"], source_url)
            page.click(NOTEBOOKLM_SELECTORS["source_submit"])

            progress("asking NotebookLM to extract tactics (in-session, no API)")
            page.fill(NOTEBOOKLM_SELECTORS["summary_prompt"], EXTRACTION_PROMPT)
            page.click(NOTEBOOKLM_SELECTORS["summary_send"])

            body = self._await_summary(page, progress)
            if not body:
                return NotebookLMResult(source_url, "", "", False, "no summary returned within timeout")

            title = body.split("\n", 1)[0].strip()[:120] or f"Tactics from {source_url}"
            progress("captured summary")
            return NotebookLMResult(source_url, title, body, True)
        except Exception as e:  # noqa: BLE001
            log.exception("notebooklm extraction failed")
            return NotebookLMResult(source_url, "", "", False, str(e))

    def _await_summary(self, page, progress: ProgressFn) -> str:
        deadline = time.monotonic() + SUMMARY_POLL_TIMEOUT_S
        last = ""
        while time.monotonic() < deadline:
            try:
                el = page.query_selector(NOTEBOOKLM_SELECTORS["summary_response"])
                text = (el.inner_text() if el else "") or ""
            except Exception:
                text = ""
            # Settle: same non-empty text across two polls = streaming finished.
            if text and text == last:
                return text.strip()
            last = text
            time.sleep(2)
        return last.strip()


def extract_tactics(
    source_url: str,
    storage_state: Path | None = None,
    headless: bool = True,
    progress: ProgressFn = _no_progress,
) -> dict:
    """Drive NotebookLM for one URL and return a tactics-shaped result dict
    (the same shape the Tactics Scraper returns, so the ingestion path is shared).
    """
    with NotebookLMController(storage_state=storage_state, headless=headless) as ctl:
        res = ctl.run(source_url, progress=progress)
    tactics = [res.as_tactic()] if res.ok else []
    return {"tactics": tactics, "count": len(tactics), "ok": res.ok, "error": res.error}


def main() -> None:
    parser = argparse.ArgumentParser(description="NotebookLM tactic extractor")
    parser.add_argument("url", help="video/podcast/Reel URL to ingest")
    parser.add_argument("--storage-state", type=Path, default=None)
    parser.add_argument("--headed", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    out = extract_tactics(
        args.url,
        storage_state=args.storage_state,
        headless=not args.headed,
        progress=lambda m: print(f"[notebooklm] {m}", file=sys.stderr),
    )
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
