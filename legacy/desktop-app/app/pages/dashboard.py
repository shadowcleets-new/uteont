"""Dashboard — agents-at-a-glance grid + system health."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtWidgets import (
    QFormLayout,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from app.agents import AGENTS, AgentSpec
from app.pages.base import AppPage
from app.telemetry import fmt_duration, get_telemetry
from app.theme import TOKENS, card_qss, heading_font, pill_style, pill_text

DEFAULT_STORAGE_PATH = Path("browser_automation/.session/storage_state.json")
DEFAULT_SELECTORS_PATH = Path("browser_automation/selectors.yaml")
DEFAULT_CONFIG_PATH = Path("configs/gemini_params.yaml")


class _AgentCard(QFrame):
    clicked = Signal(str)

    def __init__(self, spec: AgentSpec, parent=None):
        super().__init__(parent)
        self.spec = spec
        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setStyleSheet(card_qss(hover_accent=True))
        self.setMinimumHeight(108)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(8)

        top = QHBoxLayout()
        top.setSpacing(8)
        name = QLabel(spec.sidebar_label)
        name.setStyleSheet(
            f"color:{TOKENS['text']};"
            "font-family:'Poppins','Arial',sans-serif;"
            "font-weight:600;font-size:13px;"
        )
        top.addWidget(name)
        top.addStretch(1)
        self._pill = QLabel("PLANNED")
        self._set_pill("Planned")
        top.addWidget(self._pill, alignment=Qt.AlignmentFlag.AlignVCenter)
        layout.addLayout(top)

        self._stats = QLabel("0 runs · — total")
        self._stats.setStyleSheet(
            f"color:{TOKENS['text_secondary']};"
            "font-family:'Poppins','Arial',sans-serif;"
            "font-size:11px;"
        )
        layout.addWidget(self._stats)

        self._last = QLabel("Last run: never")
        self._last.setStyleSheet(
            f"color:{TOKENS['text_tertiary']};"
            "font-family:'Lora','Georgia',serif;font-size:11px;font-style:italic;"
        )
        layout.addWidget(self._last)

    def _set_pill(self, state: str) -> None:
        self._pill.setText(pill_text(state))
        self._pill.setStyleSheet(pill_style(state))

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.spec.key)
        super().mousePressEvent(event)

    def update_stats(self, total_runs: int, total_s: float, last_iso: str | None,
                     last_status: str | None, is_running: bool) -> None:
        total_str = fmt_duration(total_s) if total_s else "—"
        self._stats.setText(f"{total_runs} run{'s' if total_runs != 1 else ''} · {total_str} total")
        if last_iso:
            try:
                t = datetime.fromisoformat(last_iso)
                age = datetime.now(timezone.utc) - t
                s = int(age.total_seconds())
                if s < 60:
                    when = f"{s}s ago"
                elif s < 3600:
                    when = f"{s // 60}m ago"
                elif s < 86400:
                    when = f"{s // 3600}h ago"
                else:
                    when = f"{s // 86400}d ago"
                self._last.setText(f"Last run: {when} ({last_status})")
            except Exception:
                self._last.setText(f"Last run: {last_iso}")
        else:
            self._last.setText("Never run")

        if is_running:
            self._set_pill("Running")
        elif not self.spec.is_implemented:
            self._set_pill("Planned")
        elif last_status == "failure":
            self._set_pill("Failed")
        else:
            self._set_pill("Idle")


class _StatusRow:
    def __init__(self, label_widget: QLabel, target: Path) -> None:
        self.label = label_widget
        self.target = target

    def refresh(self) -> None:
        if self.target.exists():
            self.label.setText(
                f"<span style='color:{TOKENS['success']};font-weight:600'>OK</span>"
                f"  &nbsp;<code style='color:{TOKENS['text_secondary']}'>{self.target}</code>"
            )
        else:
            self.label.setText(
                f"<span style='color:{TOKENS['error']};font-weight:600'>MISSING</span>"
                f"  &nbsp;<code style='color:{TOKENS['text_secondary']}'>{self.target}</code>"
            )


class DashboardPage(AppPage):
    name = "Dashboard"
    agent_card_clicked = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._tel = get_telemetry()
        self._cards: dict[str, _AgentCard] = {}
        self._rows: list[_StatusRow] = []

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        outer.addWidget(scroll)

        body = QWidget()
        scroll.setWidget(body)
        layout = QVBoxLayout(body)
        layout.setContentsMargins(36, 32, 36, 32)
        layout.setSpacing(20)

        # --- title --------------------------------------------------------
        title = QLabel("UTEONT")
        title.setFont(heading_font(24, 600))
        layout.addWidget(title)

        sub = QLabel(
            "Status of all 10 agents in the pipeline plus shared infrastructure. "
            "Click any card to jump into that agent."
        )
        sub.setWordWrap(True)
        sub.setStyleSheet(
            f"color:{TOKENS['text_secondary']};"
            "font-family:'Lora','Georgia',serif;font-size:13px;"
        )
        layout.addWidget(sub)

        # --- agents grid --------------------------------------------------
        agents_box = QGroupBox("AGENTS")
        ag = QVBoxLayout(agents_box)
        ag.setContentsMargins(14, 18, 14, 14)
        ag.setSpacing(10)

        row_layout = None
        for i, spec in enumerate(AGENTS):
            if i % 2 == 0:
                row_layout = QHBoxLayout()
                row_layout.setSpacing(10)
                ag.addLayout(row_layout)
            card = _AgentCard(spec)
            card.clicked.connect(self.agent_card_clicked)
            self._cards[spec.key] = card
            row_layout.addWidget(card)
        if len(AGENTS) % 2 == 1:
            row_layout.addStretch(1)
        layout.addWidget(agents_box)

        # --- system status ------------------------------------------------
        status = QGroupBox("SYSTEM STATUS")
        sf = QFormLayout(status)
        sf.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        sf.setContentsMargins(14, 18, 14, 14)
        sf.setVerticalSpacing(10)
        for label_text, path in [
            ("Saved session", DEFAULT_STORAGE_PATH),
            ("Selectors file", DEFAULT_SELECTORS_PATH),
            ("Config file", DEFAULT_CONFIG_PATH),
        ]:
            value = QLabel("…")
            value.setTextFormat(Qt.TextFormat.RichText)
            label = QLabel(label_text.upper())
            label.setStyleSheet(
                f"color:{TOKENS['text_tertiary']};"
                "font-family:'Poppins','Arial',sans-serif;"
                "font-weight:600;font-size:10px;letter-spacing:0.6px;"
            )
            sf.addRow(label, value)
            self._rows.append(_StatusRow(value, path))
        layout.addWidget(status)

        # --- footer -------------------------------------------------------
        controls = QHBoxLayout()
        refresh = QPushButton("Refresh")
        refresh.clicked.connect(self._refresh_all)
        controls.addWidget(refresh)
        controls.addStretch(1)
        layout.addLayout(controls)

        layout.addStretch(1)

        self._tel.run_started.connect(lambda *_a: self._refresh_cards())
        self._tel.run_finished.connect(lambda *_a: self._refresh_cards())
        self._timer = QTimer(self)
        self._timer.setInterval(20_000)
        self._timer.timeout.connect(self._refresh_all)
        self._timer.start()

        self._refresh_all()

    def _refresh_all(self) -> None:
        self._refresh_cards()
        for row in self._rows:
            row.refresh()

    def _refresh_cards(self) -> None:
        all_stats = self._tel.all_stats()
        for spec in AGENTS:
            stats = all_stats.get(spec.subject_key)
            card = self._cards[spec.key]
            if stats is None:
                card.update_stats(0, 0.0, None, None, False)
            else:
                last = stats.last_run
                card.update_stats(
                    total_runs=stats.total_runs,
                    total_s=stats.total_seconds,
                    last_iso=last.started_at if last else None,
                    last_status=last.status if last else None,
                    is_running=stats.running > 0,
                )
