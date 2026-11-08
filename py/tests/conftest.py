"""Helpers for building small throwaway repositories in tests."""

from __future__ import annotations

import json
import subprocess
from collections.abc import Callable
from pathlib import Path

import pytest

PACKAGE = {
    "name": "fixture",
    "version": "9.9.9",
    "repository": "github:example-org/nest",
    "homepage": "https://nest.example.test",
}
PAGE = "## Where I started\n\nFixture text, not a real contributor.\n"
COHORT = (
    "id: 2027-01\nname: January 2027 cohort\nstarts: 2027-01-12\nends: 2027-04-30\n"
    "members:\n  - test-one\n  - handle: test-two\n    track: python\n"
)


def profile(handle: str, page: str = "public", intro: str = "Fixture text, not a real contributor.") -> str:
    return (
        f"handle: {handle}\nname: Fixture {handle}\ncohort: 2027-01\njoined: 2027-01-12\n"
        f"intro: {intro}\nvisibility:\n  page: {page}\n"
    )


@pytest.fixture(autouse=True)
def _no_running_repository(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GITHUB_REPOSITORY", raising=False)


@pytest.fixture
def make_repo(tmp_path: Path) -> Callable[..., Path]:
    """A repository with package.json, one cohort and the given files."""

    def make(files: dict[str, str] | None = None, cohort: bool = True) -> Path:
        root = tmp_path / "repo"
        root.mkdir(exist_ok=True)
        (root / "package.json").write_text(json.dumps(PACKAGE))
        (root / "contributors").mkdir(exist_ok=True)
        all_files = {"cohorts/2027-01/cohort.yml": COHORT} if cohort else {}
        all_files.update(files or {})
        for path, content in all_files.items():
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        return root

    return make


def git_commit(root: Path, message: str) -> None:
    """Commits everything in root on a branch called main, creating the repository if needed."""

    def git(*args: str) -> None:
        subprocess.run(
            ["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", *args],
            cwd=root,
            check=True,
            capture_output=True,
        )

    if not (root / ".git").exists():
        git("init", "-q", "-b", "main")
    git("add", "-A")
    git("commit", "-q", "-m", message)
