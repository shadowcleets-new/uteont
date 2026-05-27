"""Anthropic brand theme — colors, typography, QSS stylesheet.

Single source of truth for visual tokens. Pages should use COLORS / TOKENS
and the helper functions (pill_style, card_qss) instead of hardcoding
hex values.

Brand reference:
    Dark: #141413        Light: #faf9f5
    Mid Gray: #b0aea5    Light Gray: #e8e6dc
    Orange: #d97757      Blue: #6a9bcc       Green: #788c5d

Typography:
    Headings & UI chrome: Poppins (fallback: Arial)
    Body / descriptive prose: Lora (fallback: Georgia)
"""

from __future__ import annotations

from PySide6.QtGui import QFont


# --- raw brand palette ----------------------------------------------------
COLORS = {
    "dark":       "#141413",
    "light":      "#faf9f5",
    "mid_gray":   "#b0aea5",
    "light_gray": "#e8e6dc",
    "orange":     "#d97757",
    "blue":       "#6a9bcc",
    "green":      "#788c5d",
}

# --- semantic tokens ------------------------------------------------------
TOKENS = {
    # raw palette aliases (so QSS can reference either name)
    "dark":           "#141413",
    "light":          "#faf9f5",
    "mid_gray":       "#b0aea5",
    "light_gray":     "#e8e6dc",
    "orange":         "#d97757",
    "blue":           "#6a9bcc",
    "green":          "#788c5d",
    # semantic tokens
    "bg":             "#faf9f5",
    "surface":        "#ffffff",
    "surface_alt":    "#f3f1ea",
    "border":         "#e8e6dc",
    "border_strong":  "#cfccc1",
    "text":           "#141413",
    "text_secondary": "#6b6a64",
    "text_tertiary":  "#9a988e",
    "accent":         "#d97757",
    "accent_hover":   "#c66948",
    "accent_pressed": "#b35d3f",
    "info":           "#6a9bcc",
    "success":        "#788c5d",
    "error":          "#a33b2b",
}

# --- font stacks ----------------------------------------------------------
HEADING_FAMILIES = ["Poppins", "Arial", "sans-serif"]
BODY_FAMILIES    = ["Lora", "Georgia", "serif"]
UI_FAMILIES      = ["Poppins", "Arial", "sans-serif"]
MONO_FAMILIES    = ["Consolas", "Menlo", "Courier New", "monospace"]


def app_font() -> QFont:
    """Default app font — Poppins for UI chrome."""
    f = QFont()
    f.setFamilies(UI_FAMILIES)
    f.setPointSize(10)
    return f


def heading_font(size: int = 18, weight: int = 600) -> QFont:
    f = QFont()
    f.setFamilies(HEADING_FAMILIES)
    f.setPointSize(size)
    f.setWeight(QFont.Weight(weight))
    return f


def body_font(size: int = 10) -> QFont:
    f = QFont()
    f.setFamilies(BODY_FAMILIES)
    f.setPointSize(size)
    return f


def mono_font(size: int = 9) -> QFont:
    f = QFont()
    f.setFamilies(MONO_FAMILIES)
    f.setStyleHint(QFont.StyleHint.Monospace)
    f.setPointSize(size)
    return f


# --- pill helper ----------------------------------------------------------

_PILL_BASE = (
    "padding:3px 12px;border-radius:10px;"
    "font-family:'Poppins','Arial',sans-serif;"
    "font-weight:600;font-size:10px;letter-spacing:0.6px;"
)

_PILL_STATES = {
    "Idle":    f"background:{COLORS['light_gray']};color:{TOKENS['text_secondary']};",
    "Planned": f"background:{TOKENS['surface_alt']};color:{TOKENS['text_tertiary']};",
    "Running": f"background:{TOKENS['accent']};color:#ffffff;",
    "Success": f"background:{TOKENS['success']};color:#ffffff;",
    "Failed":  f"background:{TOKENS['error']};color:#ffffff;",
}


def pill_style(state: str) -> str:
    return _PILL_BASE + _PILL_STATES.get(state, _PILL_STATES["Idle"])


def pill_text(state: str) -> str:
    return state.upper()


# --- application-wide stylesheet -----------------------------------------

QSS = f"""
/* ---------- base ---------- */
QMainWindow, QWidget {{
    background: {TOKENS['bg']};
    color: {TOKENS['text']};
}}

QLabel {{
    color: {TOKENS['text']};
    background: transparent;
}}

/* ---------- group boxes (cards) ---------- */
QGroupBox {{
    font-family: "Poppins", "Arial", sans-serif;
    font-size: 10px;
    font-weight: 600;
    color: {TOKENS['text_secondary']};
    border: 1px solid {TOKENS['border']};
    border-radius: 10px;
    background: {TOKENS['surface']};
    margin-top: 18px;
    padding: 18px 14px 14px 14px;
}}
QGroupBox::title {{
    subcontrol-origin: margin;
    subcontrol-position: top left;
    padding: 2px 8px;
    left: 12px;
    background: {TOKENS['bg']};
    color: {TOKENS['text_secondary']};
    letter-spacing: 0.6px;
}}

/* ---------- buttons ---------- */
QPushButton {{
    font-family: "Poppins", "Arial", sans-serif;
    font-weight: 500;
    background: {TOKENS['surface']};
    border: 1px solid {TOKENS['border_strong']};
    border-radius: 6px;
    padding: 7px 16px;
    color: {TOKENS['text']};
}}
QPushButton:hover {{
    background: {TOKENS['light']};
    border-color: {TOKENS['mid_gray']};
}}
QPushButton:pressed {{
    background: {TOKENS['light_gray']};
}}
QPushButton:disabled {{
    color: {TOKENS['text_tertiary']};
    background: {TOKENS['surface_alt']};
    border-color: {TOKENS['border']};
}}

QPushButton[primary="true"] {{
    background: {TOKENS['accent']};
    border-color: {TOKENS['accent']};
    color: #ffffff;
}}
QPushButton[primary="true"]:hover {{
    background: {TOKENS['accent_hover']};
    border-color: {TOKENS['accent_hover']};
}}
QPushButton[primary="true"]:pressed {{
    background: {TOKENS['accent_pressed']};
    border-color: {TOKENS['accent_pressed']};
}}
QPushButton[primary="true"]:disabled {{
    background: {TOKENS['surface_alt']};
    border-color: {TOKENS['border']};
    color: {TOKENS['text_tertiary']};
}}

/* ---------- sidebar ---------- */
QListWidget#Sidebar {{
    background: {TOKENS['surface_alt']};
    border: none;
    border-right: 1px solid {TOKENS['border']};
    padding: 10px 0;
    outline: 0;
    font-family: "Poppins", "Arial", sans-serif;
}}
QListWidget#Sidebar::item {{
    padding: 8px 18px;
    color: {TOKENS['text']};
    border: none;
    margin: 0;
}}
QListWidget#Sidebar::item:hover {{
    background: #ece9e0;
}}
QListWidget#Sidebar::item:selected {{
    background: {TOKENS['light_gray']};
    color: {TOKENS['text']};
    border-left: 3px solid {TOKENS['accent']};
    padding-left: 15px;
}}

/* ---------- inputs ---------- */
QLineEdit, QComboBox, QPlainTextEdit, QTextEdit {{
    background: {TOKENS['surface']};
    border: 1px solid {TOKENS['border']};
    border-radius: 6px;
    padding: 6px 10px;
    color: {TOKENS['text']};
    selection-background-color: {TOKENS['accent']};
    selection-color: #ffffff;
}}
QLineEdit:focus, QComboBox:focus, QPlainTextEdit:focus, QTextEdit:focus {{
    border-color: {TOKENS['accent']};
}}
QComboBox::drop-down {{
    border: none;
    width: 20px;
}}

/* ---------- tables ---------- */
QTableWidget {{
    background: {TOKENS['surface']};
    border: 1px solid {TOKENS['border']};
    border-radius: 8px;
    gridline-color: {TOKENS['surface_alt']};
}}
QTableWidget::item {{
    padding: 6px 10px;
}}
QTableWidget::item:selected {{
    background: {TOKENS['light_gray']};
    color: {TOKENS['text']};
}}
QHeaderView::section {{
    background: {TOKENS['bg']};
    border: none;
    border-bottom: 1px solid {TOKENS['border']};
    padding: 8px 10px;
    font-family: "Poppins", "Arial", sans-serif;
    font-weight: 600;
    color: {TOKENS['text_secondary']};
    font-size: 10px;
    letter-spacing: 0.6px;
}}

/* ---------- menubar / statusbar ---------- */
QMenuBar {{
    background: {TOKENS['bg']};
    border-bottom: 1px solid {TOKENS['border']};
    padding: 2px;
    font-family: "Poppins", "Arial", sans-serif;
}}
QMenuBar::item {{
    padding: 4px 10px;
    background: transparent;
}}
QMenuBar::item:selected {{
    background: {TOKENS['light_gray']};
    border-radius: 4px;
}}
QMenu {{
    background: {TOKENS['surface']};
    border: 1px solid {TOKENS['border']};
    padding: 4px;
}}
QMenu::item {{
    padding: 5px 18px;
    border-radius: 4px;
}}
QMenu::item:selected {{
    background: {TOKENS['light_gray']};
}}
QStatusBar {{
    background: {TOKENS['surface_alt']};
    border-top: 1px solid {TOKENS['border']};
    color: {TOKENS['text_secondary']};
}}

/* ---------- docks ---------- */
QDockWidget {{
    color: {TOKENS['text']};
    font-family: "Poppins", "Arial", sans-serif;
    font-weight: 600;
    titlebar-close-icon: url(none);
    titlebar-normal-icon: url(none);
}}
QDockWidget::title {{
    background: {TOKENS['surface_alt']};
    padding: 6px 10px;
    border-top: 1px solid {TOKENS['border']};
    text-align: left;
}}

/* ---------- splitter handle ---------- */
QSplitter::handle {{
    background: {TOKENS['border']};
    width: 1px;
}}

/* ---------- scrollbars ---------- */
QScrollBar:vertical {{
    background: transparent;
    width: 10px;
    margin: 2px;
}}
QScrollBar::handle:vertical {{
    background: {TOKENS['border_strong']};
    border-radius: 4px;
    min-height: 24px;
}}
QScrollBar::handle:vertical:hover {{
    background: {TOKENS['mid_gray']};
}}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
    height: 0;
}}
QScrollBar:horizontal {{
    background: transparent;
    height: 10px;
    margin: 2px;
}}
QScrollBar::handle:horizontal {{
    background: {TOKENS['border_strong']};
    border-radius: 4px;
    min-width: 24px;
}}

/* ---------- form labels (used in stats, settings) ---------- */
QFormLayout > QLabel {{
    color: {TOKENS['text_secondary']};
}}
"""


def card_qss(hover_accent: bool = True) -> str:
    """Stylesheet for clickable card frames (dashboard agents grid)."""
    hover_rule = (
        f"QFrame:hover{{border-color:{TOKENS['accent']};background:{TOKENS['light']};}}"
        if hover_accent else ""
    )
    return (
        f"QFrame{{border:1px solid {TOKENS['border']};border-radius:10px;"
        f"background:{TOKENS['surface']};}}"
        + hover_rule
    )


def section_header_qss() -> str:
    return (
        f"color:{TOKENS['text_tertiary']};"
        f"font-family:'Poppins','Arial',sans-serif;"
        f"font-weight:700;font-size:10px;letter-spacing:1.2px;"
    )


def description_qss() -> str:
    """Style for the long-form description blocks on agent pages."""
    return (
        f"color:{TOKENS['text_secondary']};"
        f"font-family:'Lora','Georgia',serif;font-size:12px;line-height:1.5;"
    )


def apply_theme(qt_app) -> None:
    """Apply brand QSS + default font to the QApplication."""
    qt_app.setStyleSheet(QSS)
    qt_app.setFont(app_font())
