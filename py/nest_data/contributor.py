"""One contributor directory, validated. Mirrors packages/schema/src/contributor.ts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .files import (
    ALLOWED_CONTRIBUTOR_FILE,
    CONTRIBUTORS_DIR,
    IGNORED_CONTRIBUTOR_ENTRY,
    PAGE_FILE,
    PRACTICE_FILE,
    PROFILE_FILE,
    _utf16_key,
    read_practice,
    rel,
)
from .handle import explain_handle, is_handle, is_template_dir
from .issues import ValidationIssue, from_schema_issues
from .page import is_placeholder, parse_page, publish_issues
from .schema import PROFILE
from .yamlfile import read_yaml

#: A contributor as the site sees it: the same keys, in the same order, as @nest/schema's Contributor.
Contributor = dict[str, Any]


def read_text(path: Path) -> str:
    """readFileSync(path, 'utf8'): bytes that are not UTF-8 become U+FFFD instead of failing."""
    return Path(path).read_bytes().decode("utf-8", errors="replace")


def validate_contributor(root: Path, dir: str) -> tuple[Contributor | None, list[ValidationIssue]]:
    """Validates one contributor directory. Never raises on bad content."""
    issues: list[ValidationIssue] = []
    dir_path = Path(root) / CONTRIBUTORS_DIR / dir
    is_template = is_template_dir(dir)
    profile_file = rel(CONTRIBUTORS_DIR, dir, PROFILE_FILE)
    page_file = rel(CONTRIBUTORS_DIR, dir, PAGE_FILE)

    if not is_template:
        why = explain_handle(dir)
        if why:
            issues.append(
                ValidationIssue(
                    file=rel(CONTRIBUTORS_DIR, dir), field="directory", message=f"the directory name {why}"
                )
            )

    for name in sorted((p.name for p in dir_path.iterdir()), key=_utf16_key):
        if name == IGNORED_CONTRIBUTOR_ENTRY:
            continue
        if not ALLOWED_CONTRIBUTOR_FILE.match(name):
            issues.append(
                ValidationIssue(
                    file=rel(CONTRIBUTORS_DIR, dir, name),
                    field="file",
                    message=(
                        "does not belong here. A contributor directory holds profile.yml, page.md, .practice.json, "
                        "README.md, *.test.ts and test_*.py files only."
                    ),
                )
            )

    profile_path = dir_path / PROFILE_FILE
    if not profile_path.exists():
        issues.append(
            ValidationIssue(
                file=profile_file,
                field="(file)",
                message="is missing. Every contributor directory needs one.",
            )
        )
        return None, issues
    yaml = read_yaml(read_text(profile_path), profile_file)
    issues.extend(yaml.syntax_issues)
    if yaml.data is None:
        return None, issues
    profile, problems = PROFILE.parse(yaml.data)
    if problems:
        issues.extend(from_schema_issues(problems, profile_file, yaml.line_of, yaml.key_line_of))
        return None, issues
    is_public = profile["visibility"]["page"] == "public"

    def push(path: list[str | int], field: str, message: str) -> None:
        issues.append(
            ValidationIssue(file=profile_file, line=yaml.line_of(path), field=field, message=message)
        )

    if profile["handle"] != dir:
        push(["handle"], "handle", f'must match the directory name exactly: "{dir}".')
    elif not is_template:
        why = explain_handle(profile["handle"])
        if why:
            push(["handle"], "handle", why)
    if is_template and is_public:
        push(["visibility", "page"], "visibility.page", 'must stay "private" in a template directory.')

    seen_skills: dict[str, int] = {}
    for i, skill in enumerate(profile["skills_developing"]):
        first = seen_skills.get(skill.lower())
        if first is None:
            seen_skills[skill.lower()] = i
        else:
            push(
                ["skills_developing", i],
                f"skills_developing[{i}]",
                f'repeats "{skill}" from item {first + 1}. List each skill once.',
            )
    if is_public and is_placeholder(profile["intro"]):
        push(["intro"], "intro", "still has the template text. Write one or two sentences about yourself.")
    if is_public and is_placeholder(profile["name"]):
        push(["name"], "name", "still has the template text. Use the name you want on your page.")

    page_path = dir_path / PAGE_FILE
    page: dict[str, Any] = {"sections": []}
    if not page_path.exists():
        issues.append(
            ValidationIssue(
                file=page_file,
                field="(file)",
                message="is missing. Every contributor directory needs one, even if it only has the headings.",
            )
        )
    else:
        page, page_issues = parse_page(read_text(page_path), page_file)
        issues.extend(page_issues)
        if is_public:
            issues.extend(publish_issues(page, page_file))

    practice = read_practice(dir_path / PRACTICE_FILE, rel(CONTRIBUTORS_DIR, dir, PRACTICE_FILE), issues)
    contributor = {
        "dir": dir,
        "handle": profile["handle"],
        "isTemplate": is_template,
        "profile": profile,
        "page": page,
        "practice": practice,
    }
    return contributor, issues


def is_publishable(c: Contributor) -> bool:
    """True when a page may appear on the site: not a template, a valid handle, and public."""
    return (
        not c["isTemplate"]
        and is_handle(c["handle"])
        and c["handle"] == c["dir"]
        and c["profile"]["visibility"]["page"] == "public"
    )
