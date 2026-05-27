"""SQLite-backed run telemetry + Qt signals.

Every long-running task (agent run, infrastructure op) opens a row here
on start and closes it on finish. The UI subscribes to start/finish
signals to update status pills live, and queries the DB for stats.

Schema is intentionally tiny — extend it as new dimensions are needed.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from PySide6.QtCore import QObject, Signal

log = logging.getLogger("telemetry")

DB_PATH = Path("app/.data/telemetry.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS task_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_key  TEXT NOT NULL,
    category     TEXT NOT NULL,
    action       TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    status       TEXT NOT NULL DEFAULT 'running',
    result_json  TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_runs_subject ON task_runs(subject_key);
CREATE INDEX IF NOT EXISTS idx_task_runs_started ON task_runs(started_at DESC);
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Run:
    id: int
    subject_key: str
    category: str
    action: str
    started_at: str
    finished_at: str | None
    status: str
    result_json: str | None

    @property
    def duration_s(self) -> float | None:
        if not self.finished_at:
            return None
        try:
            t0 = datetime.fromisoformat(self.started_at)
            t1 = datetime.fromisoformat(self.finished_at)
            return (t1 - t0).total_seconds()
        except Exception:
            return None


@dataclass
class Stats:
    total_runs: int = 0
    successful: int = 0
    failed: int = 0
    running: int = 0
    total_seconds: float = 0.0
    last_run: Run | None = None

    @property
    def avg_seconds(self) -> float:
        completed = self.successful + self.failed
        return self.total_seconds / completed if completed else 0.0

    @property
    def success_rate(self) -> float:
        completed = self.successful + self.failed
        return self.successful / completed if completed else 0.0


class Telemetry(QObject):
    run_started = Signal(str, int)         # (subject_key, run_id)
    run_finished = Signal(str, int, str)   # (subject_key, run_id, status)

    def __init__(self, db_path: Path = DB_PATH) -> None:
        super().__init__()
        self.db_path = db_path
        self._lock = threading.RLock()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def _connect(self):
        # check_same_thread=False because workers run on QThreads
        conn = sqlite3.connect(self.db_path, check_same_thread=False, isolation_level=None)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    # --- writes ----------------------------------------------------------

    def start_run(self, subject_key: str, category: str, action: str) -> int:
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO task_runs (subject_key, category, action, started_at, status) "
                "VALUES (?, ?, ?, ?, 'running')",
                (subject_key, category, action, _now_iso()),
            )
            run_id = int(cur.lastrowid)
        log.debug("telemetry.start_run id=%d subject=%s action=%s", run_id, subject_key, action)
        self.run_started.emit(subject_key, run_id)
        return run_id

    def finish_run(self, run_id: int, status: str, result: dict | None = None) -> None:
        result_json = json.dumps(result, default=str) if result is not None else None
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT subject_key FROM task_runs WHERE id = ?", (run_id,)
            ).fetchone()
            if row is None:
                log.warning("telemetry.finish_run for unknown id=%d", run_id)
                return
            subject_key = row["subject_key"]
            conn.execute(
                "UPDATE task_runs SET finished_at = ?, status = ?, result_json = ? WHERE id = ?",
                (_now_iso(), status, result_json, run_id),
            )
        log.debug("telemetry.finish_run id=%d status=%s", run_id, status)
        self.run_finished.emit(subject_key, run_id, status)

    # --- reads -----------------------------------------------------------

    def recent_runs(self, subject_key: str | None = None, limit: int = 50) -> list[Run]:
        with self._lock, self._connect() as conn:
            if subject_key is None:
                cur = conn.execute(
                    "SELECT * FROM task_runs ORDER BY id DESC LIMIT ?", (limit,)
                )
            else:
                cur = conn.execute(
                    "SELECT * FROM task_runs WHERE subject_key = ? ORDER BY id DESC LIMIT ?",
                    (subject_key, limit),
                )
            return [_row_to_run(r) for r in cur.fetchall()]

    def stats_for(self, subject_key: str) -> Stats:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM task_runs WHERE subject_key = ? ORDER BY id DESC",
                (subject_key,),
            ).fetchall()
        return _aggregate(rows)

    def all_stats(self) -> dict[str, Stats]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT * FROM task_runs").fetchall()
        out: dict[str, list[sqlite3.Row]] = {}
        for r in rows:
            out.setdefault(r["subject_key"], []).append(r)
        return {k: _aggregate(v) for k, v in out.items()}


def _row_to_run(r: sqlite3.Row) -> Run:
    return Run(
        id=r["id"],
        subject_key=r["subject_key"],
        category=r["category"],
        action=r["action"],
        started_at=r["started_at"],
        finished_at=r["finished_at"],
        status=r["status"],
        result_json=r["result_json"],
    )


def _aggregate(rows: list[sqlite3.Row]) -> Stats:
    s = Stats()
    s.total_runs = len(rows)
    last = None
    for r in rows:
        run = _row_to_run(r)
        if last is None:
            last = run
        if run.status == "success":
            s.successful += 1
        elif run.status == "failure":
            s.failed += 1
        elif run.status == "running":
            s.running += 1
        d = run.duration_s
        if d is not None:
            s.total_seconds += d
    s.last_run = last
    return s


_TELEMETRY: Telemetry | None = None


def get_telemetry() -> Telemetry:
    global _TELEMETRY
    if _TELEMETRY is None:
        _TELEMETRY = Telemetry()
    return _TELEMETRY


def fmt_duration(seconds: float | None) -> str:
    if seconds is None:
        return "—"
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m {seconds % 60}s"
    h = seconds // 3600
    m = (seconds % 3600) // 60
    return f"{h}h {m}m"
