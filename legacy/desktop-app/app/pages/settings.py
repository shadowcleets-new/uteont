"""Settings page — persistent paths, log level, window state via QSettings."""

from __future__ import annotations

import logging

from PySide6.QtCore import QSettings
from PySide6.QtWidgets import (
    QComboBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
)

from app.pages.base import AppPage
from app.theme import TOKENS, description_qss, heading_font

log = logging.getLogger("app.settings")

DEFAULTS = {
    "paths/config": "configs/gemini_params.yaml",
    "paths/selectors": "browser_automation/selectors.yaml",
    "paths/storage_state": "browser_automation/.session/storage_state.json",
    "log/level": "INFO",
}

LOG_LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR"]


def get_setting(key: str) -> str:
    s = QSettings()
    val = s.value(key, DEFAULTS.get(key, ""))
    return str(val) if val is not None else ""


class SettingsPage(AppPage):
    name = "Settings"

    def __init__(self, parent=None):
        super().__init__(parent)
        self._settings = QSettings()

        layout = QVBoxLayout(self)
        layout.setContentsMargins(36, 32, 36, 32)
        layout.setSpacing(16)

        title = QLabel("Settings")
        title.setFont(heading_font(20, 600))
        layout.addWidget(title)

        desc = QLabel(
            "Stored via QSettings (per-user). These values are reference "
            "defaults — individual pages have their own per-run overrides."
        )
        desc.setWordWrap(True)
        desc.setStyleSheet(description_qss())
        layout.addWidget(desc)

        paths = QGroupBox("DEFAULT FILE PATHS")
        pf = QFormLayout(paths)
        pf.setContentsMargins(14, 18, 14, 14)
        pf.setVerticalSpacing(10)
        self._config_edit = QLineEdit()
        self._selectors_edit = QLineEdit()
        self._storage_edit = QLineEdit()
        pf.addRow("Config (gemini_params.yaml):", self._config_edit)
        pf.addRow("Selectors (selectors.yaml):", self._selectors_edit)
        pf.addRow("Storage state (storage_state.json):", self._storage_edit)
        layout.addWidget(paths)

        logging_group = QGroupBox("LOGGING")
        lf = QFormLayout(logging_group)
        lf.setContentsMargins(14, 18, 14, 14)
        lf.setVerticalSpacing(10)
        self._log_combo = QComboBox()
        self._log_combo.addItems(LOG_LEVELS)
        lf.addRow("Log level:", self._log_combo)
        layout.addWidget(logging_group)

        btn_row = QHBoxLayout()
        save = QPushButton("Save")
        save.setProperty("primary", True)
        reset = QPushButton("Reset to defaults")
        save.clicked.connect(self._save)
        reset.clicked.connect(self._reset)
        btn_row.addWidget(save)
        btn_row.addWidget(reset)
        btn_row.addStretch(1)
        layout.addLayout(btn_row)

        self._status = QLabel("")
        layout.addWidget(self._status)
        layout.addStretch(1)

        self._load()

    def _load(self) -> None:
        self._config_edit.setText(get_setting("paths/config"))
        self._selectors_edit.setText(get_setting("paths/selectors"))
        self._storage_edit.setText(get_setting("paths/storage_state"))
        level = get_setting("log/level")
        if level in LOG_LEVELS:
            self._log_combo.setCurrentText(level)
        else:
            self._log_combo.setCurrentText("INFO")

    def _save(self) -> None:
        self._settings.setValue("paths/config", self._config_edit.text())
        self._settings.setValue("paths/selectors", self._selectors_edit.text())
        self._settings.setValue("paths/storage_state", self._storage_edit.text())
        self._settings.setValue("log/level", self._log_combo.currentText())
        logging.getLogger().setLevel(self._log_combo.currentText())
        self._status.setText(
            f"<span style='color:{TOKENS['success']};font-weight:600'>Saved.</span>"
        )
        log.info("settings saved (log level → %s)", self._log_combo.currentText())

    def _reset(self) -> None:
        for k, v in DEFAULTS.items():
            self._settings.setValue(k, v)
        self._load()
        self._status.setText(
            f"<span style='color:{TOKENS['success']};font-weight:600'>Reset.</span>"
        )
