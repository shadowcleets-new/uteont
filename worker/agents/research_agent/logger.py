"""SQLite-backed per-run log for the Research Agent.

Each run writes one row with: agent name, timestamp, action, status, result.
Independent of the app's telemetry DB — the agent must work standalone via
CLI without the desktop app installed.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("agents.research.logger")

SCHEMA = """
CREATE TABLE IF NOT EXISTS agent_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name  TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    action      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'running',
    result_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON agent_runs(started_at DESC);
"""

AGENT_NAME = "research_agent"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class RunLogger:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def _connect(self):
        c = sqlite3.connect(self.db_path, isolation_level=None)
        c.row_factory = sqlite3.Row
        try:
            yield c
        finally:
            c.close()

    def start(self, action: str) -> int:
        with self._connect() as c:
            cur = c.execute(
                "INSERT INTO agent_runs (agent_name, started_at, action, status) "
                "VALUES (?, ?, ?, 'running')",
                (AGENT_NAME, _now_iso(), action),
            )
            run_id = int(cur.lastrowid)
        log.info("run %d started — action=%s", run_id, action)
        return run_id

    def finish(self, run_id: int, status: str, result: dict | None = None) -> None:
        payload = json.dumps(result, default=str) if result is not None else None
        with self._connect() as c:
            c.execute(
                "UPDATE agent_runs SET finished_at = ?, status = ?, result_json = ? WHERE id = ?",
                (_now_iso(), status, payload, run_id),
            )
        log.info("run %d finished — status=%s", run_id, status)

    def recent(self, limit: int = 20) -> list[dict]:
        with self._connect() as c:
            rows = c.execute(
                "SELECT * FROM agent_runs ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]
