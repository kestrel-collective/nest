"""Where things live in the repository, and reading .practice.json. Mirrors packages/schema/src/files.ts."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from . import jsutil
from .issues import ValidationIssue, from_schema_issues, no_line
from .schema import PRACTICE

CONTRIBUTORS_DIR = "contributors"
COHORTS_DIR = "cohorts"
COHORT_FILE = "cohort.yml"
PROFILE_FILE = "profile.yml"
PAGE_FILE = "page.md"
PRACTICE_FILE = ".practice.json"

#: Files allowed in a contributor directory: *.test.ts on the js track, test_*.py on the python track.
ALLOWED_CONTRIBUTOR_FILE = re.compile(
    r"^(profile\.yml|page\.md|\.practice\.json|README\.md|[a-z0-9-]+\.test\.ts|test_[a-z0-9_]+\.py)\Z"
)
#: Left behind by Python when the track's tests run. Never committed, never reported.
IGNORED_CONTRIBUTOR_ENTRY = "__pycache__"

EMPTY_PRACTICE: dict[str, Any] = {
    "updated_at": "1970-01-01T00:00:00Z",
    "practice": 0,
    "shared": 0,
    "stages_done": [],
}


def rel(*parts: str) -> str:
    """Repository-relative path with forward slashes, the form used in every message."""
    return "/".join(parts)


def _list_dirs(base: Path) -> list[str]:
    if not base.exists():
        return []
    # plain character order, as Array.prototype.sort() orders these names
    return sorted((p.name for p in base.iterdir() if p.is_dir()), key=_utf16_key)


def _utf16_key(name: str) -> bytes:
    return name.encode("utf-16-be")


def list_contributor_dirs(root: Path) -> list[str]:
    return _list_dirs(Path(root) / CONTRIBUTORS_DIR)


def list_cohort_ids(root: Path) -> list[str]:
    return _list_dirs(Path(root) / COHORTS_DIR)


def read_practice(path: Path, file: str, issues: list[ValidationIssue]) -> dict[str, Any]:
    """Reads .practice.json when present. A missing file means zero counts."""
    if not path.exists():
        return dict(EMPTY_PRACTICE, stages_done=[])
    try:
        data = jsutil.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        issues.append(
            ValidationIssue(
                file=file,
                line=1,
                field="(file)",
                message="is not valid JSON. This file is written by a workflow; restore it from main rather than editing it.",
            )
        )
        return dict(EMPTY_PRACTICE, stages_done=[])
    parsed, problems = PRACTICE.parse(data)
    if problems:
        issues.extend(from_schema_issues(problems, file, no_line, no_line))
        return dict(EMPTY_PRACTICE, stages_done=[])
    if len(set(parsed["stages_done"])) != len(parsed["stages_done"]):
        issues.append(ValidationIssue(file=file, field="stages_done", message="lists a stage twice."))
    return parsed


def stages_done(practice: dict[str, Any]) -> int:
    """Number of distinct stages completed, 0 to 7. The "stage" every page and the feed report."""
    return len(set(practice["stages_done"]))
