"""Main window: sectioned sidebar + stacked pages + bottom log dock."""

from __future__ import annotations

import logging

from PySide6.QtCore import QByteArray, QSettings, Qt
from PySide6.QtGui import QAction, QColor, QFont, QKeySequence
from PySide6.QtWidgets import (
    QDockWidget,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QPlainTextEdit,
    QSplitter,
    QStackedWidget,
    QStatusBar,
    QVBoxLayout,
    QWidget,
)

from app.log_bus import get_bus
from app.pages import SECTIONS
from app.pages.agent_page import AgentPage
from app.pages.dashboard import DashboardPage
from app.theme import TOKENS, mono_font

log = logging.getLogger("app.main_window")

GEOMETRY_KEY = "window/geometry"
STATE_KEY = "window/state"
SPLITTER_KEY = "window/splitter"


class _LogDock(QDockWidget):
    def __init__(self, parent=None):
        super().__init__("LOGS", parent)
        self.setObjectName("LogDock")
        self.setAllowedAreas(
            Qt.DockWidgetArea.BottomDockWidgetArea | Qt.DockWidgetArea.TopDockWidgetArea
        )
        self._view = QPlainTextEdit()
        self._view.setReadOnly(True)
        self._view.setMaximumBlockCount(5000)
        self._view.setPlaceholderText("Application logs will appear here.")
        self._view.setFont(mono_font(9))
        self._view.setStyleSheet(
            f"QPlainTextEdit{{background:{TOKENS['surface']};color:{TOKENS['text']};"
            f"border:none;border-top:1px solid {TOKENS['border']};padding:6px 10px;}}"
        )
        self.setWidget(self._view)
        get_bus().record_emitted.connect(self._on_record)

    def _on_record(self, level: str, name: str, msg: str) -> None:
        self._view.appendPlainText(msg)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("UTEONT")
        self.resize(1280, 860)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        # Sidebar (sectioned)
        self._nav = QListWidget()
        self._nav.setObjectName("Sidebar")
        self._nav.setMinimumWidth(240)
        self._nav.setMaximumWidth(320)
        self._nav.setSpacing(0)
        self._nav.setUniformItemSizes(False)

        # Stack of pages
        self._stack = QStackedWidget()

        # Map nav row → stack index (None for section headers)
        self._row_to_stack: dict[int, int | None] = {}
        self._agent_key_to_row: dict[str, int] = {}

        dashboard_ref: DashboardPage | None = None

        for section_index, (section_label, factories) in enumerate(SECTIONS):
            # Section header (non-selectable)
            header_item = QListWidgetItem(section_label)
            header_font = QFont()
            header_font.setFamilies(["Poppins", "Arial", "sans-serif"])
            header_font.setBold(True)
            header_font.setPointSize(8)
            header_font.setLetterSpacing(QFont.SpacingType.AbsoluteSpacing, 1.2)
            header_item.setFont(header_font)
            header_item.setForeground(QColor(TOKENS["text_tertiary"]))
            header_item.setFlags(Qt.ItemFlag.NoItemFlags)
            # Add top spacing for sections after the first
            if section_index > 0:
                spacer = QListWidgetItem("")
                spacer.setFlags(Qt.ItemFlag.NoItemFlags)
                spacer.setSizeHint(spacer.sizeHint().__class__(0, 12))
                self._nav.addItem(spacer)
                self._row_to_stack[self._nav.count() - 1] = None
            self._nav.addItem(header_item)
            self._row_to_stack[self._nav.count() - 1] = None

            for factory in factories:
                page = factory()
                label = getattr(page, "name", page.__class__.__name__)
                item = QListWidgetItem(label)
                self._nav.addItem(item)
                stack_idx = self._stack.addWidget(page)
                row = self._nav.count() - 1
                self._row_to_stack[row] = stack_idx
                if isinstance(page, AgentPage):
                    self._agent_key_to_row[page.spec.key] = row
                if isinstance(page, DashboardPage):
                    dashboard_ref = page

        self._nav.currentRowChanged.connect(self._on_nav_changed)
        for row, stack_idx in self._row_to_stack.items():
            if stack_idx is not None:
                self._nav.setCurrentRow(row)
                break

        if dashboard_ref is not None:
            dashboard_ref.agent_card_clicked.connect(self._on_agent_card_clicked)

        splitter.addWidget(self._nav)
        splitter.addWidget(self._stack)
        splitter.setStretchFactor(0, 0)
        splitter.setStretchFactor(1, 1)
        splitter.setSizes([260, 1020])
        splitter.setHandleWidth(1)
        self._splitter = splitter

        wrapper = QWidget()
        wl = QVBoxLayout(wrapper)
        wl.setContentsMargins(0, 0, 0, 0)
        wl.addWidget(splitter)
        self.setCentralWidget(wrapper)

        self._log_dock = _LogDock(self)
        self.addDockWidget(Qt.DockWidgetArea.BottomDockWidgetArea, self._log_dock)
        self.resizeDocks([self._log_dock], [180], Qt.Orientation.Vertical)

        self.setStatusBar(QStatusBar(self))
        self.statusBar().showMessage("Ready.")

        self._build_menus()
        self._restore_state()

        log.info(
            "application started — %d page(s) across %d section(s)",
            self._stack.count(),
            len(SECTIONS),
        )

    # --- nav handling -----------------------------------------------------

    def _on_nav_changed(self, row: int) -> None:
        target = self._row_to_stack.get(row)
        if target is None:
            for r in range(row + 1, self._nav.count()):
                if self._row_to_stack.get(r) is not None:
                    self._nav.setCurrentRow(r)
                    return
            for r in range(row - 1, -1, -1):
                if self._row_to_stack.get(r) is not None:
                    self._nav.setCurrentRow(r)
                    return
            return
        self._stack.setCurrentIndex(target)

    def _on_agent_card_clicked(self, agent_key: str) -> None:
        row = self._agent_key_to_row.get(agent_key)
        if row is not None:
            self._nav.setCurrentRow(row)

    # --- menus ------------------------------------------------------------

    def _build_menus(self) -> None:
        menu = self.menuBar()

        file_menu = menu.addMenu("&File")
        quit_action = QAction("&Quit", self)
        quit_action.setShortcut(QKeySequence.StandardKey.Quit)
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)

        view_menu = menu.addMenu("&View")
        toggle_logs = self._log_dock.toggleViewAction()
        toggle_logs.setText("Toggle &Logs")
        view_menu.addAction(toggle_logs)

    # --- persistence ------------------------------------------------------

    def _restore_state(self) -> None:
        s = QSettings()
        geom = s.value(GEOMETRY_KEY)
        if isinstance(geom, QByteArray):
            self.restoreGeometry(geom)
        state = s.value(STATE_KEY)
        if isinstance(state, QByteArray):
            self.restoreState(state)
        sizes = s.value(SPLITTER_KEY)
        if isinstance(sizes, QByteArray):
            self._splitter.restoreState(sizes)

    def closeEvent(self, event) -> None:
        s = QSettings()
        s.setValue(GEOMETRY_KEY, self.saveGeometry())
        s.setValue(STATE_KEY, self.saveState())
        s.setValue(SPLITTER_KEY, self._splitter.saveState())
        log.info("application closing — state saved")
        super().closeEvent(event)
