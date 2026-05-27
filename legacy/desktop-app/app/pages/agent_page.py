"""Generic agent page — renders status, activity, stats, recent runs, filtered logs."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QAbstractItemView,
    QFormLayout,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPlainTextEdit,
    QPushButton,
    QScrollArea,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from app.agents import AgentSpec
from app.log_bus import get_bus
from app.pages.base import AppPage
from app.telemetry import Run, Stats, fmt_duration, get_telemetry
from app.theme import (
    TOKENS,
    description_qss,
    heading_font,
    mono_font,
    pill_style,
    pill_text,
)
from app.workers import JobHandle, run_with_telemetry

log = logging.getLogger("app.agent_page")


def _humanize_iso(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        t = datetime.fromisoformat(iso)
        delta = datetime.now(timezone.utc) - t
        s = int(delta.total_seconds())
        if s < 60:
            return f"{s}s ago"
        if s < 3600:
            return f"{s // 60}m ago"
        if s < 86400:
            return f"{s // 3600}h ago"
        return f"{s // 86400}d ago"
    except Exception:
        return iso


class AgentPage(AppPage):
    def __init__(self, spec: AgentSpec, parent=None):
        super().__init__(parent)
        self.spec = spec
        self.name = spec.sidebar_label
        self._job: JobHandle | None = None
        self._tel = get_telemetry()

        # Outer scroll
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea(self)
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        outer.addWidget(scroll)

        body = QWidget()
        scroll.setWidget(body)
        layout = QVBoxLayout(body)
        layout.setContentsMargins(36, 32, 36, 32)
        layout.setSpacing(20)

        # --- header --------------------------------------------------------
        header = QHBoxLayout()
        header.setSpacing(12)
        title = QLabel(spec.name)
        title.setFont(heading_font(20, 600))
        header.addWidget(title)
        header.addStretch(1)
        self._status_pill = QLabel(pill_text("Planned" if not spec.is_implemented else "Idle"))
        self._set_status("Planned" if not spec.is_implemented else "Idle")
        header.addWidget(self._status_pill, alignment=Qt.AlignmentFlag.AlignVCenter)
        layout.addLayout(header)

        desc = QLabel(spec.description)
        desc.setWordWrap(True)
        desc.setStyleSheet(description_qss())
        layout.addWidget(desc)

        # --- inputs (only if the agent specifies an input widget) ----------
        self._input_widget = None
        if spec.input_widget_factory is not None:
            self._input_widget = spec.input_widget_factory()
            input_box = QGroupBox("INPUTS")
            ib = QVBoxLayout(input_box)
            ib.setContentsMargins(14, 18, 14, 14)
            ib.addWidget(self._input_widget)
            layout.addWidget(input_box)

        # --- controls ------------------------------------------------------
        controls = QHBoxLayout()
        self._run_btn = QPushButton("Run agent")
        self._run_btn.setProperty("primary", True)
        self._run_btn.setEnabled(spec.is_implemented)
        if not spec.is_implemented:
            self._run_btn.setToolTip(
                "Not implemented yet — runner is None in app/agents.py"
            )
        self._run_btn.clicked.connect(self._on_run)
        controls.addWidget(self._run_btn)
        controls.addStretch(1)
        self._refresh_btn = QPushButton("Refresh")
        self._refresh_btn.clicked.connect(self._refresh_all)
        controls.addWidget(self._refresh_btn)
        layout.addLayout(controls)

        # --- activity ------------------------------------------------------
        activity = QGroupBox("CURRENTLY WORKING ON")
        al = QVBoxLayout(activity)
        al.setContentsMargins(14, 14, 14, 14)
        self._current_step = QLabel(self._idle_message())
        self._current_step.setWordWrap(True)
        self._current_step.setStyleSheet(
            f"font-style:italic;color:{TOKENS['text_tertiary']};"
            "font-family:'Lora','Georgia',serif;font-size:12px;"
        )
        al.addWidget(self._current_step)
        layout.addWidget(activity)

        # --- stats (2-column) ---------------------------------------------
        stats_box = QGroupBox("STATISTICS")
        sg = QHBoxLayout(stats_box)
        sg.setContentsMargins(14, 18, 14, 14)
        sg.setSpacing(28)

        left_form = QFormLayout()
        left_form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        left_form.setHorizontalSpacing(14)
        left_form.setVerticalSpacing(10)
        right_form = QFormLayout()
        right_form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        right_form.setHorizontalSpacing(14)
        right_form.setVerticalSpacing(10)

        self._stat_total = self._stat_value("0")
        self._stat_success = self._stat_value("0")
        self._stat_failed = self._stat_value("0")
        self._stat_total_time = self._stat_value("—")
        self._stat_avg_time = self._stat_value("—")
        self._stat_success_rate = self._stat_value("—")
        self._stat_last_run = self._stat_value("Not run yet")

        left_form.addRow(self._stat_label("Total runs"), self._stat_total)
        left_form.addRow(self._stat_label("Successful"), self._stat_success)
        left_form.addRow(self._stat_label("Failed"), self._stat_failed)
        left_form.addRow(self._stat_label("Success rate"), self._stat_success_rate)

        right_form.addRow(self._stat_label("Total time worked"), self._stat_total_time)
        right_form.addRow(self._stat_label("Average run"), self._stat_avg_time)
        right_form.addRow(self._stat_label("Last run"), self._stat_last_run)

        sg.addLayout(left_form, 1)
        sg.addLayout(right_form, 1)
        layout.addWidget(stats_box)

        # --- last result ---------------------------------------------------
        result_box = QGroupBox("LAST RESULT")
        rb = QVBoxLayout(result_box)
        rb.setContentsMargins(14, 18, 14, 14)
        self._result_view = QPlainTextEdit()
        self._result_view.setReadOnly(True)
        self._result_view.setPlaceholderText(
            "The most recent run's result will appear here as JSON."
        )
        self._result_view.setFont(mono_font(9))
        self._result_view.setMinimumHeight(160)
        rb.addWidget(self._result_view)
        layout.addWidget(result_box)

        # --- recent runs ---------------------------------------------------
        recent = QGroupBox("RECENT RUNS")
        rl = QVBoxLayout(recent)
        rl.setContentsMargins(14, 18, 14, 14)
        self._table = QTableWidget(0, 4)
        self._table.setHorizontalHeaderLabels(["Started", "Status", "Duration", "Action"])
        self._table.verticalHeader().setVisible(False)
        self._table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self._table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self._table.setShowGrid(False)
        self._table.setAlternatingRowColors(True)
        self._table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self._table.horizontalHeader().setStretchLastSection(True)
        self._table.setMinimumHeight(180)
        self._empty_table_label = QLabel("No runs yet — they'll appear here once the agent runs.")
        self._empty_table_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty_table_label.setStyleSheet(
            f"color:{TOKENS['text_tertiary']};padding:32px;"
            "font-family:'Lora','Georgia',serif;font-size:12px;font-style:italic;"
        )
        rl.addWidget(self._empty_table_label)
        rl.addWidget(self._table)
        layout.addWidget(recent)

        # --- log feed (filtered to this agent) ----------------------------
        logbox = QGroupBox(f"LOGS  ·  filter: {spec.logger_prefix}")
        ll = QVBoxLayout(logbox)
        ll.setContentsMargins(14, 18, 14, 14)
        self._log_view = QPlainTextEdit()
        self._log_view.setReadOnly(True)
        self._log_view.setMaximumBlockCount(2000)
        self._log_view.setPlaceholderText(
            f"Log entries from any logger named '{spec.logger_prefix}*' will stream here."
        )
        self._log_view.setFont(mono_font(9))
        self._log_view.setMinimumHeight(140)
        ll.addWidget(self._log_view)
        layout.addWidget(logbox)

        layout.addStretch(1)

        # Wire signals
        get_bus().record_emitted.connect(self._on_log_record)
        self._tel.run_started.connect(self._on_run_started)
        self._tel.run_finished.connect(self._on_run_finished)

        self._humanize_timer = QTimer(self)
        self._humanize_timer.setInterval(15_000)
        self._humanize_timer.timeout.connect(self._refresh_stats_only)
        self._humanize_timer.start()

        self._refresh_all()

    # --- small builders --------------------------------------------------

    def _stat_label(self, text: str) -> QLabel:
        lbl = QLabel(text.upper())
        lbl.setStyleSheet(
            f"color:{TOKENS['text_tertiary']};"
            "font-family:'Poppins','Arial',sans-serif;"
            "font-weight:600;font-size:10px;letter-spacing:0.6px;"
        )
        return lbl

    def _stat_value(self, text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setStyleSheet(
            f"color:{TOKENS['text']};"
            "font-family:'Poppins','Arial',sans-serif;"
            "font-weight:500;font-size:14px;"
        )
        return lbl

    def _idle_message(self) -> str:
        if not self.spec.is_implemented:
            return "Not implemented yet. Wire a runner in app/agents.py to enable this agent."
        return "Idle. Click Run agent to start a run."

    # --- event hooks --------------------------------------------------

    def _on_log_record(self, level: str, logger_name: str, msg: str) -> None:
        if logger_name == self.spec.logger_prefix or logger_name.startswith(self.spec.logger_prefix + "."):
            self._log_view.appendPlainText(msg)
            if self._is_running():
                self._current_step.setText(msg.split(": ", 1)[-1][:200])

    def _on_run_started(self, subject_key: str, run_id: int) -> None:
        if subject_key != self.spec.subject_key:
            return
        self._set_status("Running")
        self._current_step.setText("Starting…")
        self._refresh_all()

    def _on_run_finished(self, subject_key: str, run_id: int, status: str) -> None:
        if subject_key != self.spec.subject_key:
            return
        end_state = "Success" if status == "success" else ("Failed" if status == "failure" else "Idle")
        self._set_status(end_state)
        self._current_step.setText(self._idle_message())
        self._refresh_all()

    # --- run --------------------------------------------------------------

    def _on_run(self) -> None:
        if not self.spec.is_implemented or self.spec.runner is None:
            return
        agent_logger = logging.getLogger(self.spec.logger_prefix)

        def _progress(step: str) -> None:
            agent_logger.info(step)

        inputs = self._input_widget.get_inputs() if self._input_widget else None
        runner = self.spec.runner

        def _runner_call() -> dict:
            return runner(_progress, inputs)

        self._run_btn.setEnabled(False)
        self._job = run_with_telemetry(
            self, self.spec.subject_key, "agent", self.spec.name, _runner_call
        )
        self._job.worker.finished.connect(self._on_job_done)
        self._job.worker.failed.connect(self._on_job_failed)

    def _on_job_done(self, result) -> None:
        try:
            text = json.dumps(result, indent=2, default=str)
        except Exception:
            text = repr(result)
        self._result_view.setPlainText(text)
        self._log_view.appendPlainText("→ done — see Last Result panel")
        self._run_btn.setEnabled(self.spec.is_implemented)

    def _on_job_failed(self, err: str) -> None:
        self._result_view.setPlainText(f"FAILED: {err}")
        self._log_view.appendPlainText(f"→ FAILED: {err}")
        self._run_btn.setEnabled(self.spec.is_implemented)

    # --- helpers ----------------------------------------------------------

    def _is_running(self) -> bool:
        return self._status_pill.text().upper() == "RUNNING"

    def _set_status(self, text: str) -> None:
        self._status_pill.setText(pill_text(text))
        self._status_pill.setStyleSheet(pill_style(text))

    def _refresh_all(self) -> None:
        self._refresh_stats_only()
        self._refresh_table()

    def _refresh_stats_only(self) -> None:
        s: Stats = self._tel.stats_for(self.spec.subject_key)
        self._stat_total.setText(str(s.total_runs))
        self._stat_success.setText(str(s.successful))
        self._stat_failed.setText(str(s.failed))
        self._stat_total_time.setText(fmt_duration(s.total_seconds) if s.total_seconds else "—")
        self._stat_avg_time.setText(fmt_duration(s.avg_seconds) if s.avg_seconds else "—")
        if s.successful + s.failed > 0:
            self._stat_success_rate.setText(f"{s.success_rate * 100:.0f}%")
        else:
            self._stat_success_rate.setText("—")
        if s.last_run:
            status = s.last_run.status
            self._stat_last_run.setText(f"{_humanize_iso(s.last_run.started_at)} ({status})")
        else:
            self._stat_last_run.setText("Not run yet")
        if not self._is_running():
            if not self.spec.is_implemented:
                self._set_status("Planned")
            elif s.last_run and s.last_run.status == "running":
                self._set_status("Running")
            else:
                self._set_status("Idle")

    def _refresh_table(self) -> None:
        runs = self._tel.recent_runs(self.spec.subject_key, limit=50)
        self._table.setRowCount(len(runs))
        self._empty_table_label.setVisible(len(runs) == 0)
        self._table.setVisible(len(runs) > 0)
        for i, run in enumerate(runs):
            self._table.setItem(i, 0, QTableWidgetItem(_humanize_iso(run.started_at)))
            status_item = QTableWidgetItem(run.status)
            self._table.setItem(i, 1, status_item)
            self._table.setItem(
                i, 2, QTableWidgetItem(fmt_duration(run.duration_s) if run.duration_s else "—")
            )
            self._table.setItem(i, 3, QTableWidgetItem(run.action))
