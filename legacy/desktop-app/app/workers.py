"""QThread workers + telemetry-wrapped variant.

Pattern:
    handle = run_in_thread(self, fn, *args, **kwargs)
    handle.worker.finished.connect(self._on_done)
    handle.worker.failed.connect(self._on_err)

For agent / infra runs you want telemetered:
    handle = run_with_telemetry(self, "agent.research", "agent",
                                 "discover_keywords", fn, *args, **kwargs)

The handle keeps strong refs so Python's GC doesn't collect them.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable

from PySide6.QtCore import QObject, QThread, Signal, Slot

from app.telemetry import get_telemetry

log = logging.getLogger("workers")


class Worker(QObject):
    finished = Signal(object)   # callable's return value
    failed = Signal(str)        # "ExcType: message"

    def __init__(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        super().__init__()
        self._fn = fn
        self._args = args
        self._kwargs = kwargs

    @Slot()
    def run(self) -> None:
        try:
            result = self._fn(*self._args, **self._kwargs)
            self.finished.emit(result)
        except Exception as e:
            log.exception("worker '%s' raised", getattr(self._fn, "__name__", self._fn))
            self.failed.emit(f"{type(e).__name__}: {e}")


@dataclass
class JobHandle:
    thread: QThread
    worker: Worker
    run_id: int | None = None


def run_in_thread(
    parent: QObject, fn: Callable[..., Any], *args: Any, **kwargs: Any
) -> JobHandle:
    """Spin up a QThread, move a Worker onto it, run `fn(*args, **kwargs)`."""
    thread = QThread(parent)
    worker = Worker(fn, *args, **kwargs)
    worker.moveToThread(thread)
    thread.started.connect(worker.run)
    worker.finished.connect(thread.quit)
    worker.failed.connect(thread.quit)
    worker.finished.connect(worker.deleteLater)
    worker.failed.connect(worker.deleteLater)
    thread.finished.connect(thread.deleteLater)
    thread.start()
    return JobHandle(thread=thread, worker=worker)


def run_with_telemetry(
    parent: QObject,
    subject_key: str,
    category: str,
    action: str,
    fn: Callable[..., Any],
    *args: Any,
    **kwargs: Any,
) -> JobHandle:
    """Wrap `fn` with telemetry start/finish bookkeeping.

    Logs a 'running' row before fn runs, updates to 'success'/'failure'
    after. The wrapped fn's return value flows through unchanged.
    """
    tel = get_telemetry()
    run_id = tel.start_run(subject_key, category, action)

    def _wrapped():
        try:
            result = fn(*args, **kwargs)
        except Exception as e:
            tel.finish_run(
                run_id, "failure", {"error": f"{type(e).__name__}: {e}"}
            )
            raise
        try:
            payload = result if isinstance(result, dict) else {"result_repr": repr(result)[:2000]}
            tel.finish_run(run_id, "success", payload)
        except Exception:
            log.exception("telemetry.finish_run on success failed")
        return result

    handle = run_in_thread(parent, _wrapped)
    handle.run_id = run_id
    return handle
