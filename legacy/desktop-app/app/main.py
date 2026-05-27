"""UTEONT — desktop entry point.

Run from project root:
    python -m app
"""

from __future__ import annotations

import logging
import sys

from PySide6.QtCore import QCoreApplication, Qt
from PySide6.QtWidgets import QApplication

from app.log_bus import install_log_bus
from app.main_window import MainWindow
from app.theme import apply_theme

APP_NAME = "UTEONT"
ORG_NAME = "UTEONT"
ORG_DOMAIN = "uteont.local"


def main() -> int:
    install_log_bus(level=logging.INFO)

    QCoreApplication.setOrganizationName(ORG_NAME)
    QCoreApplication.setOrganizationDomain(ORG_DOMAIN)
    QCoreApplication.setApplicationName(APP_NAME)
    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_EnableHighDpiScaling, True)

    qt_app = QApplication(sys.argv)
    qt_app.setStyle("Fusion")
    apply_theme(qt_app)

    window = MainWindow()
    window.show()
    return qt_app.exec()


if __name__ == "__main__":
    sys.exit(main())
