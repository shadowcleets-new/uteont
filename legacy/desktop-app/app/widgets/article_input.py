"""Shared input widget for agents that operate on a single markdown article.

Used by SEO Optimization Agent and QA Agent. Returns `{article, target_keyword}`
via `get_inputs()`.
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from app.theme import TOKENS, mono_font

SAMPLE_ARTICLE = """# AI Writing Tools: A Practical Guide

The rise of AI writing tools has transformed how marketers, students, and
professionals create content. This guide walks through the categories that
matter, what to look for, and the trade-offs each makes.

## What counts as an AI writing tool

Anything that generates, edits, or restructures prose using a language model
qualifies. The category spans short-form helpers, full-draft generators, and
specialized editors.

## How to evaluate one

Look for three things: output quality on your specific use case, the cost
model, and whether your edits stay within the tool or have to be replayed.
"""


class ArticleInputWidget(QWidget):
    """Two-field input: target keyword (optional) + markdown article body."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        # Target keyword row
        kw_row = QHBoxLayout()
        kw_label = QLabel("Target keyword:")
        kw_label.setStyleSheet(
            f"color:{TOKENS['text_secondary']};"
            "font-family:'Poppins','Arial',sans-serif;font-size:11px;"
        )
        self._target_kw = QLineEdit()
        self._target_kw.setPlaceholderText("e.g. ai writing tools (optional)")
        kw_row.addWidget(kw_label)
        kw_row.addWidget(self._target_kw, 1)
        layout.addLayout(kw_row)

        # Article row
        article_label = QLabel("Article markdown:")
        article_label.setStyleSheet(
            f"color:{TOKENS['text_secondary']};"
            "font-family:'Poppins','Arial',sans-serif;font-size:11px;"
        )
        layout.addWidget(article_label)

        self._article = QPlainTextEdit()
        self._article.setPlaceholderText("Paste your article markdown here…")
        self._article.setFont(mono_font(9))
        self._article.setMinimumHeight(200)
        layout.addWidget(self._article, 1)

        # File / sample / clear actions
        btn_row = QHBoxLayout()
        load = QPushButton("Load from file…")
        sample = QPushButton("Insert sample")
        clear = QPushButton("Clear")
        load.clicked.connect(self._on_load_file)
        sample.clicked.connect(self._on_insert_sample)
        clear.clicked.connect(self._on_clear)
        btn_row.addWidget(load)
        btn_row.addWidget(sample)
        btn_row.addWidget(clear)
        btn_row.addStretch(1)
        layout.addLayout(btn_row)

    def get_inputs(self) -> dict:
        return {
            "article": self._article.toPlainText(),
            "target_keyword": self._target_kw.text().strip() or None,
        }

    # --- handlers ---------------------------------------------------------

    def _on_load_file(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Load article markdown",
            "",
            "Markdown / text (*.md *.markdown *.txt);;All files (*)",
        )
        if path:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    self._article.setPlainText(f.read())
            except Exception as e:
                self._article.appendPlainText(f"\n(could not read {path}: {e})")

    def _on_insert_sample(self) -> None:
        self._article.setPlainText(SAMPLE_ARTICLE)
        if not self._target_kw.text().strip():
            self._target_kw.setText("ai writing tools")

    def _on_clear(self) -> None:
        self._article.clear()
