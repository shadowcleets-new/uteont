"""AI Studio page — run controller self-test or send a custom prompt."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from pathlib import Path

from PySide6.QtWidgets import (
    QComboBox,
    QFormLayout,
    QGroupBox,
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

log = logging.getLogger("app.ai_studio")
SUBJECT_KEY = "infra.ai_studio"

DEFAULT_CONFIG_PATH = "configs/gemini_params.yaml"
DEFAULT_SELECTORS_PATH = "browser_automation/selectors.yaml"
DEFAULT_STORAGE_PATH = "browser_automation/.session/storage_state.json"


class AIStudioPage(AppPage):
    name = "AI Studio"

    def __init__(self, parent=None):
        super().__init__(parent)
        self._job: JobHandle | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(36, 32, 36, 32)
        layout.setSpacing(16)

        title = QLabel("AI Studio controller")
        title.setFont(heading_font(20, 600))
        layout.addWidget(title)

        desc = QLabel(
            "Send prompts to Gemini 3.1 Pro via the browser-driven controller. "
            "Use Run self-test for a known-good PONG round-trip, or Send prompt "
            "to issue a custom prompt with a chosen agent's parameters."
        )
        desc.setWordWrap(True)
        desc.setStyleSheet(description_qss())
        layout.addWidget(desc)

        cfg = QGroupBox("CONFIGURATION")
        form = QFormLayout(cfg)
        form.setContentsMargins(14, 18, 14, 14)
        form.setVerticalSpacing(10)
        self._config_edit = QLineEdit(DEFAULT_CONFIG_PATH)
        self._selectors_edit = QLineEdit(DEFAULT_SELECTORS_PATH)
        self._storage_edit = QLineEdit(DEFAULT_STORAGE_PATH)
        self._agent_combo = QComboBox()
        self._agent_combo.setEditable(True)
        self._refresh_agents_btn = QPushButton("Refresh agents")
        self._refresh_agents_btn.clicked.connect(self._refresh_agents)

        agent_row = QHBoxLayout()
        agent_row.addWidget(self._agent_combo, 1)
        agent_row.addWidget(self._refresh_agents_btn)

        form.addRow("Config file:", self._config_edit)
        form.addRow("Selectors file:", self._selectors_edit)
        form.addRow("Storage state:", self._storage_edit)
        form.addRow("Agent:", agent_row)
        layout.addWidget(cfg)

        prompt_box = QGroupBox("PROMPT")
        pl = QVBoxLayout(prompt_box)
        pl.setContentsMargins(14, 18, 14, 14)
        self._prompt_edit = QPlainTextEdit()
        self._prompt_edit.setPlaceholderText(
            "Type a prompt here, then click Send prompt. Leave empty to use "
            "the built-in self-test prompt."
        )
        pl.addWidget(self._prompt_edit)
        layout.addWidget(prompt_box)

        btn_row = QHBoxLayout()
        self._test_btn = QPushButton("Run self-test (PONG)")
        self._send_btn = QPushButton("Send prompt")
        self._send_btn.setProperty("primary", True)
        self._test_btn.clicked.connect(self._on_test)
        self._send_btn.clicked.connect(self._on_send)
        btn_row.addWidget(self._test_btn)
        btn_row.addWidget(self._send_btn)
        btn_row.addStretch(1)
        layout.addLayout(btn_row)

        self._output = QPlainTextEdit()
        self._output.setReadOnly(True)
        self._output.setFont(mono_font(9))
        self._output.setPlaceholderText("Response will appear here as JSON.")
        layout.addWidget(self._output, 1)

        self._refresh_agents()

    # --- helpers -----------------------------------------------------------

    def _refresh_agents(self) -> None:
        try:
            import yaml  # local import keeps page importable without yaml
            data = yaml.safe_load(Path(self._config_edit.text()).read_text(encoding="utf-8"))
            agents = list((data or {}).get("agents", {}).keys())
            current = self._agent_combo.currentText()
            self._agent_combo.clear()
            self._agent_combo.addItems(agents or ["self_test"])
            if current in agents:
                self._agent_combo.setCurrentText(current)
        except Exception as e:
            self._append(f"(could not load agents: {e})")
            if self._agent_combo.count() == 0:
                self._agent_combo.addItem("self_test")

    def _set_busy(self, busy: bool) -> None:
        for b in (self._test_btn, self._send_btn):
            b.setEnabled(not busy)

    def _append(self, text: str) -> None:
        self._output.appendPlainText(text)

    def _make_controller_call(self, agent: str, prompt: str, expect_pong: bool):
        """Build a callable to run on the worker thread; returns dict result."""
        config_path = Path(self._config_edit.text())
        selectors_path = Path(self._selectors_edit.text())
        storage_path_str = self._storage_edit.text().strip()
        storage_path = Path(storage_path_str) if storage_path_str else None

        def _run():
            # Lazy imports keep app launchable without Playwright installed
            from browser_automation.ai_studio_controller import (
                AIStudioController,
                GeminiParams,
                _load_selectors,
            )
            params = GeminiParams.from_yaml(config_path, agent=agent)
            selectors = _load_selectors(selectors_path)
            with AIStudioController(
                params, selectors, storage_state=storage_path, headless=False
            ) as ctl:
                ctl.open_studio()
                ctl.apply_params()
                result = ctl.submit_prompt(prompt)
            payload = asdict(result)
            payload["pong_match"] = (
                "PONG" in result.response_text.upper() if expect_pong else None
            )
            return payload

        return _run

    # --- handlers ----------------------------------------------------------

    def _on_test(self) -> None:
        agent = "self_test"
        prompt = "Reply with exactly one word and nothing else: PONG"
        self._launch(agent, prompt, expect_pong=True)

    def _on_send(self) -> None:
        prompt = self._prompt_edit.toPlainText().strip()
        if not prompt:
            self._append("(prompt is empty — type something or use 'Run self-test')")
            return
        agent = self._agent_combo.currentText() or "self_test"
        self._launch(agent, prompt, expect_pong=False)

    def _launch(self, agent: str, prompt: str, expect_pong: bool) -> None:
        self._set_busy(True)
        self._append(f"→ controller (agent={agent}) — prompt: {prompt[:80]!r}")
        runner = self._make_controller_call(agent, prompt, expect_pong)
        action = "self_test" if expect_pong else f"send:{agent}"
        self._job = run_with_telemetry(self, SUBJECT_KEY, "infra", action, runner)
        self._job.worker.finished.connect(self._on_finished)
        self._job.worker.failed.connect(self._on_failed)

    def _on_finished(self, result) -> None:
        try:
            self._append(json.dumps(result, indent=2))
        except Exception:
            self._append(repr(result))
        self._set_busy(False)

    def _on_failed(self, err: str) -> None:
        self._append(f"FAILED: {err}")
        self._set_busy(False)
