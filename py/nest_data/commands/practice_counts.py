"""``nest practice-counts``: write every contributor's .practice.json from GitHub (the Practice counts workflow)."""

from __future__ import annotations

import os
from typing import Any

from ..config import RepoConfig, UsageError
from ..files import CONTRIBUTORS_DIR, list_contributor_dirs
from ..practice import compute_practice, gather, write_practice_file
from ..site import now_iso


def register(sub: Any) -> None:
    p = sub.add_parser(
        "practice-counts",
        help="write contributors/*/.practice.json from merged pull requests and closed stage issues (needs gh)",
    )
    p.set_defaults(run=run)


def run(config: RepoConfig, args: Any, out: Any, err: Any) -> int:
    repo = os.environ.get("GITHUB_REPOSITORY") or config.slug
    if not repo:
        raise UsageError("practice-counts needs GITHUB_REPOSITORY or a repository field in package.json.")
    prs, issues = gather(repo)
    out(f"{len(prs)} merged pull request(s), {len(issues)} closed onboarding issue(s).")
    now = now_iso()
    handles = [d for d in list_contributor_dirs(config.root) if not d.startswith("_")]
    written = 0
    for handle in handles:
        if not (config.root / CONTRIBUTORS_DIR / handle).is_dir():
            continue
        practice = compute_practice(handle, prs, issues, now)
        status = write_practice_file(config.root, handle, practice)
        written += status == "written"
        stages = ",".join(map(str, practice["stages_done"])) or "none"
        out(
            f"{handle}: practice {practice['practice']}, shared {practice['shared']}, stages {stages} ({status})"
        )
    out(f"{written} file(s) written for {len(handles)} contributor(s).")
    return 0
