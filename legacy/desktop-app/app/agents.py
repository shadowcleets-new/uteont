"""Agent registry — the 10 agents in the pipeline.

Each AgentSpec is enough to render an AgentPage. When an agent's
`runner` is None, the page shows a "Planned" pill and the Run button
is disabled. Wire a real `runner` later — the page then lights up
with no other changes.

`runner` contract:
    def runner(progress: ProgressFn, inputs: dict | None = None) -> dict:
        # progress(msg) — logs a step description (goes to filtered log feed)
        # inputs        — dict from the agent's input widget (or None)
        progress("step 1 description")
        ...
        return {"summary": "...", "artifact_path": "..."}

The returned dict is stored in the telemetry result_json AND displayed
in the agent page's "Last Result" panel.

`input_widget_factory` is an optional zero-arg callable returning a QWidget
with a `get_inputs() -> dict` method. The dict it returns is passed as
the runner's `inputs` argument. If None, the agent runs with no UI input.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

ProgressFn = Callable[[str], None]
RunnerFn = Callable[[ProgressFn, "dict | None"], dict]
InputWidgetFactory = Callable[[], Any]  # returns QWidget with get_inputs()


# --- input widget factories -----------------------------------------------

def _article_input_factory():
    """Markdown article + target keyword. Shared by QA and SEO."""
    from app.widgets.article_input import ArticleInputWidget
    return ArticleInputWidget()


# --- agent runners --------------------------------------------------------

def _research_runner(progress: ProgressFn, inputs: dict | None = None) -> dict:
    """Wire to the standalone Research Agent.

    `inputs` is unused — Research Agent reads its config from env vars.
    """
    from agents.research_agent.research_agent import run
    return run(progress=progress)


def _seo_runner(progress: ProgressFn, inputs: dict | None = None) -> dict:
    from agents.seo_optimization_agent.seo_agent import optimize
    inputs = inputs or {}
    article = (inputs.get("article") or "").strip()
    if not article:
        raise ValueError("Article markdown is required (paste into the Inputs panel)")
    target_keyword = inputs.get("target_keyword")
    return optimize(article, target_keyword=target_keyword, progress=progress)


def _qa_runner(progress: ProgressFn, inputs: dict | None = None) -> dict:
    from agents.qa_agent.qa_agent import validate
    inputs = inputs or {}
    article = (inputs.get("article") or "").strip()
    if not article:
        raise ValueError("Article markdown is required (paste into the Inputs panel)")
    target_keyword = inputs.get("target_keyword")
    return validate(article, target_keyword=target_keyword, progress=progress)


# --- AgentSpec ------------------------------------------------------------

@dataclass(frozen=True)
class AgentSpec:
    key: str                                                # "research"
    name: str                                               # "Research Agent"
    description: str
    sidebar_label: str                                      # "1. Research"
    runner: RunnerFn | None = None                          # None = stub
    input_widget_factory: InputWidgetFactory | None = None  # None = no inputs

    @property
    def subject_key(self) -> str:
        """Telemetry subject key — `agent.<key>`."""
        return f"agent.{self.key}"

    @property
    def logger_prefix(self) -> str:
        """Logger name agents should use: `agents.<key>...`."""
        return f"agents.{self.key}"

    @property
    def is_implemented(self) -> bool:
        return self.runner is not None


# --- the pipeline ---------------------------------------------------------

AGENTS: list[AgentSpec] = [
    AgentSpec(
        key="research",
        name="Research Agent",
        sidebar_label="1. Research",
        description=(
            "Discovers keyword opportunities using free signals (Google Trends "
            "via pytrends, Reddit via PRAW, GSC when connected). Outputs a "
            "ranked keywords.json consumed by Idea Generation."
        ),
        runner=_research_runner,
    ),
    AgentSpec(
        key="idea_generation",
        name="Idea Generation Agent",
        sidebar_label="2. Idea Generation",
        description=(
            "Converts raw keyword clusters into article angles + briefs via "
            "Gemini 3.1 Pro (thinking_level=low). Output gates at Idea Selection."
        ),
        runner=None,
    ),
    AgentSpec(
        key="content_writing",
        name="Content Writing Agent",
        sidebar_label="3. Content Writing",
        description=(
            "Drafts full articles from approved briefs via Gemini 3.1 Pro "
            "(thinking_level=medium). Output: drafts/*.md."
        ),
        runner=None,
    ),
    AgentSpec(
        key="qa",
        name="QA / Validation Agent",
        sidebar_label="4. QA / Validation",
        description=(
            "Deterministic pre-review checks on article markdown: readability "
            "(Flesch), passive voice, policy / forbidden phrases, and target "
            "keyword presence. Plagiarism and factuality are stubbed pending "
            "LLM-backed implementations."
        ),
        runner=_qa_runner,
        input_widget_factory=_article_input_factory,
    ),
    AgentSpec(
        key="seo_optimization",
        name="SEO Optimization Agent",
        sidebar_label="5. SEO Optimization",
        description=(
            "Deterministic SEO lint of an article: title, heading hierarchy, "
            "word count, keyword density. Generates a suggested meta "
            "description and JSON-LD Article schema."
        ),
        runner=_seo_runner,
        input_widget_factory=_article_input_factory,
    ),
    AgentSpec(
        key="technical_seo",
        name="Technical SEO Agent",
        sidebar_label="6. Technical SEO",
        description=(
            "Handles sitemap, robots.txt, canonical, hreflang, Core Web Vitals. "
            "Site-wide changes gate at Major Changes approval."
        ),
        runner=None,
    ),
    AgentSpec(
        key="publishing",
        name="Publishing Agent",
        sidebar_label="7. Publishing",
        description=(
            "Pushes content to staging only. Production publish requires "
            "explicit human approval at Production gate."
        ),
        runner=None,
    ),
    AgentSpec(
        key="backlink",
        name="Backlink / Outreach Agent",
        sidebar_label="8. Backlink / Outreach",
        description=(
            "Discovers prospects, drafts personalized outreach via Gemini 3.1 Pro "
            "(thinking_level=low). All sends require human approval."
        ),
        runner=None,
    ),
    AgentSpec(
        key="performance_tracking",
        name="Performance Tracking Agent",
        sidebar_label="9. Performance Tracking",
        description=(
            "Pulls GSC + GA4 + rank data and writes performance.json. Read-only "
            "feedback loop into Research Agent."
        ),
        runner=None,
    ),
    AgentSpec(
        key="revenue",
        name="Revenue Optimization Agent",
        sidebar_label="10. Revenue Optimization",
        description=(
            "Suggests CTA / affiliate / internal-link tweaks based on "
            "performance data. Routed through Major Changes gate."
        ),
        runner=None,
    ),
]


def by_key(key: str) -> AgentSpec | None:
    for a in AGENTS:
        if a.key == key:
            return a
    return None
