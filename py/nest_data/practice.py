"""Practice counts: each contributor's .practice.json, from merged pull requests and closed stage issues.

The only GitHub calls in the project happen here, from the Practice counts workflow. The site build reads the
committed files and never calls GitHub (ADR 0002). Ported from packages/cli/src/practice.ts.
"""

from __future__ import annotations

import json
import re
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .files import CONTRIBUTORS_DIR, PRACTICE_FILE
from .jsutil import dumps, loads
from .stages import SHARED_STAGE, STAGE_COUNT


@dataclass(frozen=True)
class MergedPr:
    number: int
    author: str
    files: Sequence[str] = field(default_factory=tuple)
    merged_at: str = ""


@dataclass(frozen=True)
class ClosedIssue:
    assignees: Sequence[str]
    labels: Sequence[str]


def _same(a: str, b: str) -> bool:
    return a.lower() == b.lower()


def compute_practice(
    handle: str, prs: Sequence[MergedPr], issues: Sequence[ClosedIssue], now: str
) -> dict[str, Any]:
    """Counts for one contributor.

    practice: merged PRs by the owner that touch only their directory. shared: merged PRs by the owner that
    touch anything outside contributors/. stages_done: closed onboarding issues assigned to the owner with a
    stage:n label, plus stage 5 as soon as one shared PR has merged.
    """
    own = f"{CONTRIBUTORS_DIR}/{handle.lower()}/"
    practice = shared = 0
    for pr in prs:
        if not _same(pr.author, handle) or not pr.files:
            continue
        files = [f.replace("\\", "/").lower() for f in pr.files]
        if all(f.startswith(own) for f in files):
            practice += 1
        elif any(not f.startswith(f"{CONTRIBUTORS_DIR}/") for f in files):
            shared += 1
    done: set[int] = set()
    for issue in issues:
        if not any(_same(a, handle) for a in issue.assignees):
            continue
        for label in issue.labels:
            m = re.fullmatch(r"stage:([1-7])", label)
            if m:
                done.add(int(m.group(1)))
    if shared > 0:
        done.add(SHARED_STAGE)
    stages_done = sorted(n for n in done if 1 <= n <= STAGE_COUNT)
    return {"updated_at": now, "practice": practice, "shared": shared, "stages_done": stages_done}


def write_practice_file(root: Path, handle: str, practice: dict[str, Any]) -> str:
    """Writes .practice.json only when the counts changed, so a nightly run with nothing new commits nothing."""
    path = Path(root) / CONTRIBUTORS_DIR / handle / PRACTICE_FILE

    def strip(p: dict[str, Any]) -> str:
        return json.dumps([p.get("practice"), p.get("shared"), p.get("stages_done")])

    if path.exists():
        try:
            if strip(loads(path.read_text(encoding="utf-8"))) == strip(practice):
                return "unchanged"
        except (ValueError, AttributeError):
            pass  # an unreadable file is rewritten
    path.write_bytes((dumps(practice) + "\n").encode("utf-8"))
    return "written"


def _gh_rows(repo: str, endpoint: str, jq: str) -> list[dict[str, Any]]:
    out = subprocess.run(
        ["gh", "api", endpoint.format(repo=repo), "--paginate", "--jq", jq],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def gather(repo: str) -> tuple[list[MergedPr], list[ClosedIssue]]:
    """Merged pull requests with their files, and closed onboarding issues, through the GitHub CLI."""
    prs = []
    for row in _gh_rows(
        repo,
        "repos/{repo}/pulls?state=closed&per_page=100",
        ".[] | select(.merged_at != null) | {number: .number, author: .user.login, merged_at: .merged_at}",
    ):
        files = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{repo}/pulls/{row['number']}/files?per_page=100",
                "--paginate",
                "--jq",
                ".[].filename",
            ],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.split()
        prs.append(
            MergedPr(number=row["number"], author=row["author"], files=files, merged_at=row["merged_at"])
        )
    issues = [
        ClosedIssue(assignees=row["assignees"], labels=row["labels"])
        for row in _gh_rows(
            repo,
            "repos/{repo}/issues?state=closed&labels=onboarding&per_page=100",
            ".[] | select(.pull_request == null) | {assignees: [.assignees[].login], labels: [.labels[].name]}",
        )
    ]
    return prs, issues
