"""Bridge Python's `logging` into a Qt signal.

Emits (level_name, logger_name, formatted_message) so subscribers can
filter by logger name. Agent pages subscribe and filter to their own
logger prefix (e.g. 'agents.research'); the global log dock subscribes
without filtering.

Usage (call once at app startup):
    install_log_bus(level=logging.INFO)
    bus = get_bus()
    bus.record_emitted.connect(my_widget.append)
"""

from __future__ import annotations

import logging
import sys

from PySide6.QtCore import QObject, Signal


class LogBus(QObject):
    record_emitted = Signal(str, str, str)  # (level_name, logger_name, formatted_message)


_BUS: LogBus | None = None


def get_bus() -> LogBus:
    global _BUS
    if _BUS is None:
        _BUS = LogBus()
    return _BUS


class _BusHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            get_bus().record_emitted.emit(record.levelname, record.name, msg)
        except Exception:
            self.handleError(record)


def install_log_bus(level: int = logging.INFO) -> None:
    """Install the bus handler + a stderr handler on the root logger.

    Idempotent: safe to call multiple times.
    """
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(level)

    if not any(isinstance(h, _BusHandler) for h in root.handlers):
        h = _BusHandler()
        h.setFormatter(fmt)
        root.addHandler(h)

    if not any(
        isinstance(h, logging.StreamHandler) and not isinstance(h, _BusHandler)
        for h in root.handlers
    ):
        sh = logging.StreamHandler(stream=sys.stderr)
        sh.setFormatter(fmt)
        root.addHandler(sh)
