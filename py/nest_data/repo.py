"""Every contributor and cohort directory, validated. Mirrors packages/schema/src/repo.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .contributor import Contributor, read_text, validate_contributor
from .files import (
    COHORT_FILE,
    COHORTS_DIR,
    CONTRIBUTORS_DIR,
    PROFILE_FILE,
    list_cohort_ids,
    list_contributor_dirs,
    rel,
)
from .handle import explain_handle, is_cohort_id
from .issues import ValidationIssue, from_schema_issues
from .jsutil import trim
from .schema import COHORT_FILE as COHORT_SCHEMA
from .yamlfile import read_yaml

#: The two onboarding tracks (ADR 0010). A member with no track named is on the js track.
TRACKS = ("js", "python")
DEFAULT_TRACK = "js"

#: A validated cohort: members as handles, and every member's track. Same keys as @nest/schema's Cohort.
Cohort = dict[str, Any]


@dataclass
class RepoResult:
    contributors: list[Contributor] = field(default_factory=list)
    cohorts: list[Cohort] = field(default_factory=list)
    issues: list[ValidationIssue] = field(default_factory=list)


def track_of(cohort: Cohort | None, handle: str) -> str:
    """The member's track, js when the cohort does not name one."""
    if cohort is None:
        return DEFAULT_TRACK
    return cohort["tracks"].get(handle, DEFAULT_TRACK)


def _member_handle(raw: Any) -> str | None:
    if isinstance(raw, str):
        return trim(raw)
    if isinstance(raw, dict) and isinstance(raw.get("handle"), str):
        return trim(raw["handle"])
    return None


def validate_cohort(root: Path, id: str) -> tuple[Cohort | None, list[ValidationIssue]]:
    """Validates one cohort directory. Never raises on bad content."""
    issues: list[ValidationIssue] = []
    file = rel(COHORTS_DIR, id, COHORT_FILE)
    path = Path(root) / COHORTS_DIR / id / COHORT_FILE
    if not is_cohort_id(id):
        issues.append(
            ValidationIssue(
                file=rel(COHORTS_DIR, id),
                field="directory",
                message="must be named as a year and month, or as a start date, for example cohorts/2027-01/ or cohorts/2027-01-12/.",
            )
        )
    if not path.exists():
        issues.append(
            ValidationIssue(
                file=file, field="(file)", message="is missing. Every cohort directory needs one."
            )
        )
        return None, issues
    yaml = read_yaml(read_text(path), file)
    issues.extend(yaml.syntax_issues)
    if yaml.data is None:
        return None, issues
    parsed, problems = COHORT_SCHEMA.parse(yaml.data)
    if problems:
        issues.extend(from_schema_issues(problems, file, yaml.line_of, yaml.key_line_of))
        return None, issues

    def push(path: list[str | int], field: str, message: str, key_of: str | None = None) -> None:
        line = yaml.line_of(path) if key_of is None else yaml.key_line_of(path, key_of)
        issues.append(ValidationIssue(file=file, line=line, field=field, message=message))

    members: list[str] = []
    tracks: dict[str, str] = {}
    for i, raw in enumerate(parsed["members"]):
        at = f"members[{i}]"
        track = DEFAULT_TRACK
        if isinstance(raw, str):
            handle = trim(raw)
        elif isinstance(raw, dict):
            for key in raw:
                if key not in ("handle", "track"):
                    push(
                        ["members", i],
                        f"{at}.{key}",
                        "is not a field in cohort.yml. Check the spelling.",
                        key,
                    )
            if raw.get("handle") is None:
                push(["members", i], f"{at}.handle", "is required.")
                continue
            if not isinstance(raw["handle"], str):
                push(["members", i, "handle"], f"{at}.handle", "must be a string.")
                continue
            handle = trim(raw["handle"])
            if raw.get("track") is None:
                push(["members", i], f"{at}.track", "is required.")
                continue
            if raw["track"] not in TRACKS:
                push(
                    ["members", i, "track"],
                    f"{at}.track",
                    "must be " + " or ".join(f'"{t}"' for t in TRACKS) + ".",
                )
                continue
            track = raw["track"]
        else:
            push(["members", i], at, "must be a handle, or a mapping with handle and track.")
            continue
        if handle == "":
            push(["members", i], at, "must not be empty.")
            continue
        members.append(handle)
        tracks[handle] = track

    cohort: Cohort = {**parsed, "members": members, "tracks": tracks}
    if cohort["id"] != id:
        push(["id"], "id", f'must match the directory name exactly: "{id}".')
    if cohort["ends"] < cohort["starts"]:
        push(["ends"], "ends", "must not be before starts.")
    seen: dict[str, int] = {}
    for i, raw in enumerate(parsed["members"]):
        member = _member_handle(raw)
        if member is None or member == "":
            continue
        path = ["members", i] if isinstance(raw, str) else ["members", i, "handle"]
        why = explain_handle(member)
        if why:
            push(path, f"members[{i}]", why)
        first = seen.get(member)
        if first is None:
            seen[member] = i
        else:
            push(path, f"members[{i}]", f'repeats "{member}" from item {first + 1}.')
    return cohort, issues


def validate_repo(root: Path) -> RepoResult:
    """Validates every contributor and cohort directory. Never raises on bad content."""
    result = RepoResult()
    for id in list_cohort_ids(root):
        cohort, issues = validate_cohort(root, id)
        result.issues.extend(issues)
        if cohort is not None:
            result.cohorts.append(cohort)
    cohort_ids = {c["id"] for c in result.cohorts}
    for dir in list_contributor_dirs(root):
        contributor, issues = validate_contributor(root, dir)
        result.issues.extend(issues)
        if contributor is None:
            continue
        result.contributors.append(contributor)
        cohort = contributor["profile"].get("cohort")
        if cohort is not None and not contributor["isTemplate"] and cohort_ids and cohort not in cohort_ids:
            result.issues.append(
                ValidationIssue(
                    file=rel(CONTRIBUTORS_DIR, dir, PROFILE_FILE),
                    field="cohort",
                    message=f'"{cohort}" has no cohorts/{cohort}/cohort.yml. Check the id with your cohort lead.',
                )
            )
    return result
