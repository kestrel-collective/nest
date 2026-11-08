"""The repository: where its root is and what the root package.json says. Mirrors packages/cli/src/root.ts."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path


class UsageError(Exception):
    """A mistake in how a command was called. The CLI prints the message and exits 2."""


@dataclass(frozen=True)
class RepoConfig:
    root: Path
    #: owner/name on GitHub.
    slug: str
    repo_url: str
    #: Public origin of the site, no trailing slash.
    site_url: str
    #: The release string the feed reports: the root package.json version.
    version: str


def _looks_like_root(d: Path) -> bool:
    return (d / "package.json").exists() and (
        (d / "contributors").exists() or (d / "packages" / "schema").exists()
    )


def find_root(start: Path | None = None) -> Path:
    d = Path(start or Path.cwd()).resolve()
    while True:
        if _looks_like_root(d):
            return d
        if d.parent == d:
            break
        d = d.parent
    raise UsageError(
        f"Could not find the Nest repository from {start or Path.cwd()}. Run this inside the repository or pass --root."
    )


_SLUG = re.compile(r"^[^/\s]+/[^/\s]+\Z")


def read_config(root: Path) -> RepoConfig:
    pkg = json.loads((Path(root) / "package.json").read_text(encoding="utf-8"))
    repository = pkg.get("repository", "")
    if isinstance(repository, dict):
        repository = repository.get("url", "")
    # Inside GitHub Actions the repository the workflow runs in wins, so a fork acts on itself.
    running = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if _SLUG.match(running):
        slug = running
    else:
        slug = re.sub(r"^github:", "", repository)
        slug = re.sub(r"^git\+", "", slug)
        slug = re.sub(r"^https?://github\.com/", "", slug)
        slug = re.sub(r"\.git$", "", slug)
    if not _SLUG.match(slug):
        raise UsageError(
            f'package.json needs a repository field like "github:owner/name" (found "{repository}").'
        )
    return RepoConfig(
        root=Path(root),
        slug=slug,
        repo_url=f"https://github.com/{slug}",
        site_url=pkg.get("homepage", "").rstrip("/"),
        version=pkg.get("version", "0.0.0"),
    )
