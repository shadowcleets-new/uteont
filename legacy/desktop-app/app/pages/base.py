"""Base class for all sidebar pages."""

from __future__ import annotations

from PySide6.QtWidgets import QWidget


class AppPage(QWidget):
    """Subclass and set `name` to register a sidebar entry.

    Pages should keep job handles on `self` so threads aren't garbage-collected
    mid-flight. See app/workers.py.
    """

    name: str = "Untitled"

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
