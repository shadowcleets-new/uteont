"""Page registry — sidebar layout with sections.

Sections are tuples of (header_label, list_of_AppPage_classes_OR_factories).
A factory is a zero-arg callable that returns an AppPage instance.

To add a new page outside the agent list, append to a section.
To add a new agent, edit app/agents.py — agent pages are generated
automatically from AGENTS.
"""

from __future__ import annotations

from typing import Callable

from app.agents import AGENTS
from app.pages.agent_page import AgentPage
from app.pages.ai_studio import AIStudioPage
from app.pages.base import AppPage
from app.pages.dashboard import DashboardPage
from app.pages.pacing import PacingPage
from app.pages.session import SessionPage
from app.pages.settings import SettingsPage

PageFactory = Callable[[], AppPage]


def _agent_factory(spec):
    return lambda: AgentPage(spec)


SECTIONS: list[tuple[str, list[PageFactory]]] = [
    ("OVERVIEW", [DashboardPage]),
    ("AGENTS", [_agent_factory(a) for a in AGENTS]),
    ("INFRASTRUCTURE", [SessionPage, AIStudioPage, PacingPage]),
    ("SETTINGS", [SettingsPage]),
]
