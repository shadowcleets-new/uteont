"""Session manager — captures and reuses Google AI Studio login state.

Owns the lifecycle of Playwright's `storage_state.json` so that
ai_studio_controller can run with `--storage-state` and skip the
login dance on every run.

Three operations:
- capture:    open headed browser, wait for manual login, save state
- verify:     load saved state, confirm AI Studio still considers us logged in
- invalidate: delete the saved state file (call after auth failures)

Standalone usage:
    python -m browser_automation.session_manager --capture
    python -m browser_automation.session_manager --verify
    python -m browser_automation.session_manager --invalidate
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright

AI_STUDIO_URL = "https://aistudio.google.com/prompts/new_chat"
DEFAULT_STORAGE_PATH = Path("browser_automation/.session/storage_state.json")
CAPTURE_LOGIN_WAIT_MS = 10 * 60 * 1000   # 10 min — generous for manual sign-in
VERIFY_TIMEOUT_MS = 45_000

log = logging.getLogger("session_manager")


class SessionManager:
    """Tracks one storage_state.json file used by the controller."""

    def __init__(self, storage_path: Path = DEFAULT_STORAGE_PATH) -> None:
        self.storage_path = storage_path

    def has_saved_state(self) -> bool:
        return self.storage_path.exists() and self.storage_path.stat().st_size > 0

    def path_if_valid(self) -> Path | None:
        """Return the path if a saved state exists; else None.

        Does NOT verify freshness. Call `verify()` for that.
        """
        return self.storage_path if self.has_saved_state() else None

    def invalidate(self) -> None:
        if self.storage_path.exists():
            self.storage_path.unlink()
            log.info("invalidated session at %s", self.storage_path)
        else:
            log.info("no session to invalidate at %s", self.storage_path)

    def capture(self) -> bool:
        """Open headed browser, wait for manual login, save storage_state."""
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=False)
            try:
                context = browser.new_context()
                page = context.new_page()
                page.goto(AI_STUDIO_URL, timeout=VERIFY_TIMEOUT_MS)
                log.warning(
                    "Sign in to your Google account in the open browser window. "
                    "Once AI Studio's main UI appears, return here. "
                    "(Waiting up to %d minutes.)",
                    CAPTURE_LOGIN_WAIT_MS // 60_000,
                )
                try:
                    page.wait_for_url(
                        lambda u: "aistudio.google.com" in u
                        and "accounts.google.com" not in u,
                        timeout=CAPTURE_LOGIN_WAIT_MS,
                    )
                except PlaywrightTimeout:
                    log.error("login did not complete before timeout — nothing saved")
                    return False
                page.wait_for_load_state("networkidle", timeout=VERIFY_TIMEOUT_MS)
                context.storage_state(path=str(self.storage_path))
                log.info("saved storage_state to %s", self.storage_path)
                return True
            finally:
                browser.close()

    def verify(self) -> bool:
        """Load saved state and confirm AI Studio loads without redirect to login.

        Runs headless. Returns True iff the page URL stays on aistudio.google.com.
        """
        if not self.has_saved_state():
            log.error("no saved session at %s", self.storage_path)
            return False
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                context = browser.new_context(storage_state=str(self.storage_path))
                page = context.new_page()
                try:
                    page.goto(AI_STUDIO_URL, timeout=VERIFY_TIMEOUT_MS)
                    page.wait_for_load_state(
                        "networkidle", timeout=VERIFY_TIMEOUT_MS
                    )
                except PlaywrightTimeout:
                    log.error("could not load AI Studio with saved session")
                    return False
                if "accounts.google.com" in page.url:
                    log.error("session expired — redirected to %s", page.url)
                    return False
                log.info("session verified — still logged in")
                return True
            finally:
                browser.close()


def main() -> None:
    p = argparse.ArgumentParser(description="AI Studio session manager")
    p.add_argument(
        "--storage-path",
        type=Path,
        default=DEFAULT_STORAGE_PATH,
        help=f"path to storage_state.json (default {DEFAULT_STORAGE_PATH})",
    )
    p.add_argument(
        "--capture",
        action="store_true",
        help="open headed browser and capture a new session interactively",
    )
    p.add_argument(
        "--verify",
        action="store_true",
        help="verify saved session is still valid",
    )
    p.add_argument(
        "--invalidate",
        action="store_true",
        help="delete saved session file",
    )
    p.add_argument("--log-level", default="INFO")
    args = p.parse_args()

    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    flags = (args.capture, args.verify, args.invalidate)
    if sum(bool(f) for f in flags) != 1:
        p.error("specify exactly one of --capture, --verify, --invalidate")

    sm = SessionManager(args.storage_path)
    if args.capture:
        sys.exit(0 if sm.capture() else 1)
    if args.verify:
        sys.exit(0 if sm.verify() else 1)
    if args.invalidate:
        sm.invalidate()
        sys.exit(0)


if __name__ == "__main__":
    main()
