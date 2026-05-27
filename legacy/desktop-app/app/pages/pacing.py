"""Pacing page — run the pure-Python pacing self-test, view sample delays."""

from __future__ import annotations

import logging

from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
)

from app.pages.base import AppPage
from app.theme import description_qss, heading_font, mono_font
from app.workers import JobHandle, run_with_telemetry

log = logging.getLogger("app.pacing")
SUBJECT_KEY = "infra.pacing"


def _run_pacing_test() -> dict:
    """Pure-Python — exercises HumanPacing, RateLimitDetector, Cooldown."""
    import random as _rand
    from browser_automation.pacing import (
        Cooldown,
        HumanPacing,
        RateLimitDetector,
        RateLimitInfo,
    )

    pacing = HumanPacing(rng=_rand.Random(42))
    samples = {
        action: [round(pacing.delay_for(action), 3) for _ in range(5)]
        for action in ("click", "type", "submit", "navigate", "unknown_action")
    }

    detector = RateLimitDetector()
    hit = detector.check("Sorry, you've reached your daily quota. Try again later.")
    miss = detector.check("Here is your generated content.")
    empty = detector.check("")

    notes: list[str] = []
    cooldown = Cooldown(
        notifier=notes.append,
        max_cooldown_s=1,
        sleeper=lambda _s: None,
    )
    slept = cooldown.wait(
        RateLimitInfo(matched_signal="quota", raw_text="quota exceeded", cooldown_s=10_000)
    )

    return {
        "pacing_samples": samples,
        "detector_hit": str(hit),
        "detector_miss": str(miss),
        "detector_empty": str(empty),
        "cooldown_slept_s": slept,
        "notifier_messages": notes,
        "passed": hit is not None and miss is None and empty is None and slept == 1 and bool(notes),
    }


class PacingPage(AppPage):
    name = "Pacing"

    def __init__(self, parent=None):
        super().__init__(parent)
        self._job: JobHandle | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(36, 32, 36, 32)
        layout.setSpacing(16)

        title = QLabel("Pacing self-test")
        title.setFont(heading_font(20, 600))
        layout.addWidget(title)

        desc = QLabel(
            "Pure-Python — no browser. Verifies Gaussian delay distribution, "
            "rate-limit signal detection, and cooldown clamping + notifier."
        )
        desc.setWordWrap(True)
        desc.setStyleSheet(description_qss())
        layout.addWidget(desc)

        btn_row = QHBoxLayout()
        self._run_btn = QPushButton("Run pacing test")
        self._run_btn.setProperty("primary", True)
        self._run_btn.clicked.connect(self._on_run)
        btn_row.addWidget(self._run_btn)
        btn_row.addStretch(1)
        layout.addLayout(btn_row)

        self._output = QPlainTextEdit()
        self._output.setReadOnly(True)
        self._output.setFont(mono_font(9))
        self._output.setPlaceholderText("Output will appear here after you run the test.")
        layout.addWidget(self._output, 1)

    def _on_run(self) -> None:
        self._run_btn.setEnabled(False)
        self._output.clear()
        self._output.appendPlainText("→ running pacing self-test…")
        self._job = run_with_telemetry(self, SUBJECT_KEY, "infra", "self_test", _run_pacing_test)
        self._job.worker.finished.connect(self._on_done)
        self._job.worker.failed.connect(self._on_err)

    def _on_done(self, result) -> None:
        import json
        self._output.appendPlainText(json.dumps(result, indent=2, default=str))
        self._output.appendPlainText(
            "\n>>> PASSED" if result.get("passed") else "\n>>> FAILED"
        )
        self._run_btn.setEnabled(True)

    def _on_err(self, err: str) -> None:
        self._output.appendPlainText(f"FAILED: {err}")
        self._run_btn.setEnabled(True)
