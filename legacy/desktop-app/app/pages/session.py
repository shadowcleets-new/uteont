"""Session page — capture / verify / invalidate AI Studio session."""

from __future__ import annotations

import logging
from pathlib import Path

from PySide6.QtWidgets import (
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
)

from app.pages.base import AppPage
from app.theme import description_qss, heading_font, mono_font
from app.workers import JobHandle, run_with_telemetry

log = logging.getLogger("app.session")
SUBJECT_KEY = "infra.session"

DEFAULT_STORAGE_PATH = Path("browser_automation/.session/storage_state.json")


class SessionPage(AppPage):
    name = "Session"

    def __init__(self, parent=None):
        super().__init__(parent)
        self._job: JobHandle | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(36, 32, 36, 32)
        layout.setSpacing(16)

        title = QLabel("Google AI Studio session")
        title.setFont(heading_font(20, 600))
        layout.addWidget(title)

        desc = QLabel(
            "Capture a session once (interactive Google login), then reuse "
            "it for unattended runs via Verify."
        )
        desc.setWordWrap(True)
        desc.setStyleSheet(description_qss())
        layout.addWidget(desc)

        path_row = QHBoxLayout()
        path_lbl = QLabel("storage_state.json:")
        path_row.addWidget(path_lbl)
        self._path_edit = QLineEdit(str(DEFAULT_STORAGE_PATH))
        path_row.addWidget(self._path_edit, 1)
        browse = QPushButton("Browse…")
        browse.clicked.connect(self._on_browse)
        path_row.addWidget(browse)
        layout.addLayout(path_row)

        btn_row = QHBoxLayout()
        self._capture_btn = QPushButton("Capture (interactive)")
        self._capture_btn.setProperty("primary", True)
        self._verify_btn = QPushButton("Verify (headless)")
        self._invalidate_btn = QPushButton("Invalidate")
        self._capture_btn.clicked.connect(self._on_capture)
        self._verify_btn.clicked.connect(self._on_verify)
        self._invalidate_btn.clicked.connect(self._on_invalidate)
        btn_row.addWidget(self._capture_btn)
        btn_row.addWidget(self._verify_btn)
        btn_row.addWidget(self._invalidate_btn)
        btn_row.addStretch(1)
        layout.addLayout(btn_row)

        self._output = QPlainTextEdit()
        self._output.setReadOnly(True)
        self._output.setFont(mono_font(9))
        self._output.setPlaceholderText(
            "Operation output will appear here. Capture opens a browser window — "
            "complete Google sign-in there."
        )
        layout.addWidget(self._output, 1)

    def _on_browse(self) -> None:
        new_path, _ = QFileDialog.getSaveFileName(
            self,
            "Choose storage_state.json location",
            self._path_edit.text(),
            "JSON files (*.json)",
        )
        if new_path:
            self._path_edit.setText(new_path)

    def _set_busy(self, busy: bool) -> None:
        for b in (self._capture_btn, self._verify_btn, self._invalidate_btn):
            b.setEnabled(not busy)

    def _append(self, text: str) -> None:
        self._output.appendPlainText(text)

    def _make_session_manager(self):
        # Lazy import — avoids hard-failing app launch if Playwright isn't installed
        from browser_automation.session_manager import SessionManager
        return SessionManager(Path(self._path_edit.text()))

    def _run(self, fn_name: str) -> None:
        self._set_busy(True)
        self._append(f"→ {fn_name}…")
        try:
            sm = self._make_session_manager()
        except ImportError as e:
            self._append(f"FAILED to load SessionManager: {e}")
            self._set_busy(False)
            return
        fn = getattr(sm, fn_name)
        self._job = run_with_telemetry(self, SUBJECT_KEY, "infra", fn_name, fn)
        self._job.worker.finished.connect(self._on_finished)
        self._job.worker.failed.connect(self._on_failed)

    def _on_capture(self) -> None:
        self._run("capture")

    def _on_verify(self) -> None:
        self._run("verify")

    def _on_invalidate(self) -> None:
        try:
            sm = self._make_session_manager()
            sm.invalidate()
            self._append("Invalidated.")
        except Exception as e:
            self._append(f"FAILED: {e}")

    def _on_finished(self, result) -> None:
        self._append(f"Result: {result!r}")
        self._set_busy(False)

    def _on_failed(self, err: str) -> None:
        self._append(f"FAILED: {err}")
        self._set_busy(False)
