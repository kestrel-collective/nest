"""The files of a python-track scaffold. profile.yml and page.md are byte for byte what the js track's
scaffold writes (packages/cli/src/templates.ts, held by tests/golden/scaffold-cases.json); README.md and
test_profile.py are the python track's own (ADR 0010).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from .jsutil import trim
from .page import PAGE_SECTIONS


@dataclass
class ScaffoldPlan:
    """Everything the scaffold needs to render a contributor directory. Defects edit this before rendering."""

    handle: str
    #: None for an individual joiner with no cohort.
    cohort: str | None
    joined: str
    name: str = "Replace this with the name you want on your page"
    next: str | None = None
    skills: list[str] = field(default_factory=list)
    visibility: str = "private"
    section_order: list[str] = field(default_factory=lambda: list(PAGE_SECTIONS))


def default_plan(handle: str, cohort: str | None, joined: str) -> ScaffoldPlan:
    return ScaffoldPlan(handle=handle, cohort=cohort, joined=joined)


_NEEDS_QUOTES = re.compile(r"[:#'\"{}\[\],&*?|<>=!%@`]")


def yaml_string(s: str) -> str:
    return json.dumps(s, ensure_ascii=False) if _NEEDS_QUOTES.search(s) or s != trim(s) else s


def render_profile(plan: ScaffoldPlan) -> str:
    lines = [
        "# Your profile. Fill in name, intro and skills_developing in your own words.",
        "# Leave handle, cohort and joined as they are; they are set for you. docs/CONTRIBUTING.md explains every field.",
        f"handle: {plan.handle}",
        f"name: {yaml_string(plan.name)}",
        "# cohort: none. Set it when you join one, as YYYY-MM."
        if plan.cohort is None
        else f"cohort: {plan.cohort}",
        f"joined: {plan.joined}",
        "intro: Replace this with one or two sentences about where you are now, not where you want to be.",
        "skills_developing: []" if not plan.skills else "skills_developing:",
        *[f"  - {yaml_string(s)}" for s in plan.skills],
        *([] if plan.next is None else [f"next: {yaml_string(plan.next)}"]),
        "visibility:",
        "  # private until Stage 2. Change it to public when your page is ready; change it back any time.",
        f"  page: {plan.visibility}",
        "# Work accepted by other projects goes here, newest first, with the merged pull request address. "
        "Leave it empty until there is some.",
        "projects: []",
        "",
    ]
    return "\n".join(lines)


PLACEHOLDERS = {
    "Where I started": (
        "Replace this paragraph with where you were when you joined: what you could already do, and what "
        "brought you here. Two or three sentences are plenty."
    ),
    "What I learned": (
        "Replace this paragraph with one thing you learned that you did not expect to, or delete this section "
        "until you have one."
    ),
    "What I built": (
        "Replace this paragraph with what you built, starting with this page, or delete this section for now."
    ),
    "What I am working on next": (
        "Replace this paragraph with what you are working on next and why, or delete this section for now."
    ),
}


def render_page(plan: ScaffoldPlan) -> str:
    return "\n".join(f"## {title}\n\n{PLACEHOLDERS[title]}\n" for title in plan.section_order)


def render_readme(plan: ScaffoldPlan, repo_url: str) -> str:
    h = plan.handle
    return "\n".join(
        [
            f"# contributors/{h}",
            "",
            f"This directory belongs to @{h}. Only its owner edits it; everyone else reviews. It is on the python track.",
            "",
            "What is here and what to do with it:",
            "",
            "- `profile.yml`: who you are. Fill it in during Stage 2. Checked on every pull request.",
            '- `page.md`: your page, four short sections. Fill in "Where I started" during Stage 2.',
            "- `test_profile.py`: the tests that guard your page, run by pytest. Stage 4 adds one.",
            "- `.practice.json`: counts written by a workflow after your pull requests merge. Never edit it by hand.",
            "",
            "Before you push: `nest validate` tells you the file, the line and the field of anything that needs "
            f"changing, and `nest page-status {h} --local` says whether the site would build your page. You read the "
            "page itself on your pull request's Cloudflare preview, once it is public.",
            "",
            f"Your issues, in order: {repo_url}/issues?q=is%3Aopen+assignee%3A{h}+label%3Aonboarding",
            "",
        ]
    )


def render_test(plan: ScaffoldPlan) -> str:
    return "\n".join(
        [
            f'"""The tests that guard the page of @{plan.handle}. pytest runs them on every pull request."""',
            "",
            "from pathlib import Path",
            "",
            "from nest_data.contributor import validate_contributor",
            "",
            "# The repository root, two directories up from this file.",
            "ROOT = Path(__file__).resolve().parents[2]",
            f'HANDLE = "{plan.handle}"',
            "",
            "",
            "def test_validates_without_problems():",
            "    contributor, issues = validate_contributor(ROOT, HANDLE)",
            "    assert issues == []",
            "",
            "",
            "# Stage 4: add the test that would have caught the defect you fixed in Stage 3.",
            "# Start from the shape of the test above. It should fail with the defect and pass without it.",
            "",
        ]
    )


def render_all(plan: ScaffoldPlan, repo_url: str) -> dict[str, str]:
    return {
        "profile.yml": render_profile(plan),
        "page.md": render_page(plan),
        "README.md": render_readme(plan, repo_url),
        "test_profile.py": render_test(plan),
    }
