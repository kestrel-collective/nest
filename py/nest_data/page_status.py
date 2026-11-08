"""``nest page-status``: whether the site would build one person's page, and why not.

Mirrors packages/schema/src/page-status.ts and packages/cli/src/commands/page-status.ts, line for line of
output, so the two can be compared (tests/golden).
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import RepoConfig, UsageError
from .contributor import is_publishable, read_text
from .files import COHORTS_DIR, CONTRIBUTORS_DIR, PROFILE_FILE, rel
from .issues import ValidationIssue, format_issue
from .repo import validate_repo
from .site import HOME_RECENT, by_activity, page_url, published_contributors
from .yamlfile import YamlError, load


@dataclass
class PageStatus:
    handle: str
    profile_file: str
    exists: bool
    visibility: str | None
    own_issues: list[ValidationIssue]
    other_issues: list[ValidationIssue]
    is_template: bool
    builds: bool
    page: bool
    feed: bool
    cohort_page: str | None
    home_recent: bool
    url: str


def _js_string(value: Any) -> str:
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def page_status(root: Path, handle: str, site_url: str) -> PageStatus:
    """What the site would build for one contributor from the files under root, by the site's own rules."""
    d = handle.removeprefix("@").strip().lower()
    profile_file = rel(CONTRIBUTORS_DIR, d, PROFILE_FILE)
    profile_path = Path(root) / CONTRIBUTORS_DIR / d / PROFILE_FILE
    exists = profile_path.exists()
    visibility: str | None = None
    if exists:
        try:
            data = load(read_text(profile_path))
        except YamlError:
            data = None
        raw = data.get("visibility") if isinstance(data, dict) else None
        raw = raw.get("page") if isinstance(raw, dict) else None
        visibility = None if raw is None else _js_string(raw)

    result = validate_repo(root)
    prefix = rel(CONTRIBUTORS_DIR, d)
    own = [i for i in result.issues if i.file == prefix or i.file.startswith(f"{prefix}/")]
    other = [i for i in result.issues if not (i.file == prefix or i.file.startswith(f"{prefix}/"))]
    builds = len(result.issues) == 0
    published = published_contributors(result) if builds else []
    me = next((c for c in published if c["handle"] == d), None)
    cohort_id = me["profile"].get("cohort") if me else None
    contributor = next((c for c in result.contributors if c["dir"] == d), None)
    return PageStatus(
        handle=d,
        profile_file=profile_file,
        exists=exists,
        visibility=visibility,
        own_issues=own,
        other_issues=other,
        is_template=contributor["isTemplate"] if contributor else d.startswith("_"),
        builds=builds,
        page=me is not None and is_publishable(me),
        feed=me is not None,
        cohort_page=cohort_id
        if cohort_id is not None and any(k["id"] == cohort_id for k in result.cohorts)
        else None,
        home_recent=me is not None and any(c["handle"] == d for c in by_activity(published)[:HOME_RECENT]),
        url=page_url(site_url, d),
    )


def _git(root: Path, args: list[str], input: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(["git", *args], cwd=root, input=input, capture_output=True, check=False)


def materialize(root: Path, ref: str, dest: Path) -> None:
    """Writes every file under contributors/ and cohorts/ at the ref into dest, reading them in one git call."""
    listing = _git(root, ["ls-tree", "-r", "-z", "--name-only", ref, "--", CONTRIBUTORS_DIR, COHORTS_DIR])
    if listing.returncode != 0:
        raise UsageError(f"git could not list {ref}: {listing.stderr.decode().strip()}")
    paths = [p for p in listing.stdout.decode("utf-8").split("\0") if p]
    (dest / CONTRIBUTORS_DIR).mkdir(parents=True, exist_ok=True)
    if not paths:
        return
    batch = _git(root, ["cat-file", "--batch"], "".join(f"{ref}:{p}\n" for p in paths).encode("utf-8"))
    if batch.returncode != 0:
        raise UsageError(f"git could not read {ref}: {batch.stderr.decode().strip()}")
    out, at = batch.stdout, 0
    for path in paths:
        eol = out.index(b"\n", at)
        header = out[at:eol].decode("utf-8").split(" ")
        at = eol + 1
        if len(header) < 3 or header[1] != "blob":
            continue
        size = int(header[2])
        target = dest.joinpath(*path.split("/"))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(out[at : at + size])
        at += size + 1


def _resolve_ref(config: RepoConfig, ref: str | None, fetch: bool, err: Any) -> tuple[str, str]:
    if ref is None:
        if fetch and _git(config.root, ["fetch", "--quiet", "origin", "main"]).returncode != 0:
            err("Could not fetch origin main, so this shows what this clone last saw of main.")
        has_remote = (
            _git(config.root, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"]).returncode
            == 0
        )
        ref = "origin/main" if has_remote else "main"
    log = _git(config.root, ["log", "-1", "--format=%h, %cs", ref, "--"])
    if log.returncode != 0:
        raise UsageError(f'"{ref}" is not a git ref in {config.root}.')
    return ref, f"{ref} (commit {log.stdout.decode().strip()})"


def _or_missing(value: str | None) -> str:
    return "missing" if value is None else value


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def blockers(s: PageStatus, where: str) -> list[str]:
    """Sentences for why the page would not appear, most fundamental first."""
    if not s.exists:
        return [
            f"{s.profile_file} is not on {where}. The scaffold pull request for @{s.handle} has to be merged first."
        ]
    why: list[str] = []
    if s.is_template:
        why.append("Directories that start with _ are templates. They never publish.")
    if s.own_issues:
        why.append(
            "The files in this directory do not validate. Fix the problems listed above in a pull request."
        )
    if s.visibility != "public":
        why.append(f"visibility.page is {_or_missing(s.visibility)}. Set it to public in a pull request.")
    if s.other_issues:
        why.append(
            f"{_plural(len(s.other_issues), 'problem')} in other files stop the whole site from building, "
            "so no page changes until they are fixed."
        )
    return why


def run_page_status(
    config: RepoConfig,
    handle: str,
    out: Any,
    err: Any,
    ref: str | None = None,
    local: bool = False,
    fetch: bool = True,
) -> int:
    """Prints what the site would build for one contributor. Exit code 0 when the page would appear, 1 when not."""
    source, label, where = config.root, "the working tree", "the working tree"
    temp: Path | None = None
    try:
        if not local:
            r, label = _resolve_ref(config, ref, fetch, err)
            where = r
            temp = Path(tempfile.mkdtemp(prefix="nest-page-status-"))
            materialize(config.root, r, temp)
            source = temp
        s = page_status(source, handle, config.site_url)
        out(f"Page status for @{s.handle} on {label}")
        out("")
        out(f"profile.yml       {'exists' if s.exists else 'not found'}: {s.profile_file}")
        out(f"visibility.page   {_or_missing(s.visibility) if s.exists else '-'}")
        if not s.own_issues:
            out(f"validates         {'yes' if s.exists else '-'}")
        else:
            out(f"validates         no, {_plural(len(s.own_issues), 'problem')}:")
            for i in s.own_issues:
                out(f"                    {format_issue(i)}")
        if s.builds:
            out("site builds       yes")
        else:
            total = len(s.own_issues) + len(s.other_issues)
            out(f"site builds       no, {_plural(total, 'problem')} in the repository")
            for i in s.other_issues:
                out(f"                    {format_issue(i)}")
        out(f"page              {'yes' if s.page else 'no'}")
        out(f"feed entry        {'yes' if s.feed else 'no'} (the landing site and the page count read it)")
        out(f"cohort page       {f'yes, /cohorts/{s.cohort_page}/' if s.cohort_page else 'no'}")
        if s.home_recent:
            home = "yes, among the most active pages shown"
        elif s.feed:
            home = "counted, not among the most active pages shown"
        else:
            home = "no"
        out(f"home page         {home}")
        out(f"url               {s.url}")
        out("")
        if s.page:
            out("The page is live a few minutes after this commit reaches main.")
            return 0
        out("Why it would not appear:")
        for line in blockers(s, where):
            out(f"  - {line}")
        return 1
    finally:
        if temp is not None:
            shutil.rmtree(temp, ignore_errors=True)
