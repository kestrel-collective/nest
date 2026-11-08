"""One problem in one file, readable by a first-time contributor (ADR 0007), and the plain sentences for schema issues."""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

Path = Sequence[str | int]
LineOf = Callable[[Path], "int | None"]
KeyLineOf = Callable[[Path, str], "int | None"]


@dataclass(frozen=True)
class ValidationIssue:
    #: Path relative to the repository root, with forward slashes.
    file: str
    #: Dotted field path such as visibility.page or projects[1].url, or the file itself.
    field: str
    #: A plain sentence.
    message: str
    #: 1-based line, when known.
    line: int | None = None


def format_issue(issue: ValidationIssue) -> str:
    where = issue.file if issue.line is None else f"{issue.file}:{issue.line}"
    return f"{where} {issue.field}: {issue.message}"


def field_name(path: Path) -> str:
    if len(path) == 0:
        return "(file)"
    parts = []
    for i, part in enumerate(path):
        if isinstance(part, int):
            parts.append(f"[{part}]")
        elif i == 0:
            parts.append(str(part))
        else:
            parts.append(f".{part}")
    return "".join(parts)


def _plural(n: Any) -> str:
    return "" if n == 1 else "s"


def plain_message(issue: dict[str, Any], field: str) -> str:
    """The sentence for one schema issue. Mirrors plainMessage in packages/schema/src/issues.ts."""
    code = issue["code"]
    if code == "invalid_type":
        if issue.get("received") == "undefined":
            return "is required."
        expected = issue["expected"]
        word = (
            "a list"
            if expected == "array"
            else "a mapping of fields"
            if expected == "object"
            else f"a {expected}"
        )
        return f"must be {word}."
    if code == "too_small":
        origin, minimum = issue["origin"], issue["minimum"]
        if origin == "string":
            return "must not be empty." if minimum == 1 else f"must be at least {minimum} characters."
        if origin == "array":
            return f"needs at least {minimum} item{_plural(minimum)}."
        return f"must be at least {minimum}."
    if code == "too_big":
        origin, maximum = issue["origin"], issue["maximum"]
        if origin == "string":
            return f"must be at most {maximum} characters."
        if origin == "array":
            return f"may have at most {maximum} item{_plural(maximum)}."
        return f"must be at most {maximum}."
    if code == "invalid_format":
        fmt = issue["format"]
        if fmt == "date":
            return "must be a date written as YYYY-MM-DD, for example 2027-01-12."
        if fmt == "datetime":
            return "must be a timestamp written like 2027-01-12T09:30:00Z."
        if fmt == "url":
            return "must be a full web address starting with https://."
        if fmt == "regex" and field == "cohort":
            return "must be a year and month written as YYYY-MM, for example 2027-01."
        if fmt == "regex" and field.endswith(".repo"):
            return "must be written as owner/name, for example kestrel-collective/nest."
        return "is not in the expected format."
    if code == "invalid_value":
        return "must be " + " or ".join(json.dumps(v, ensure_ascii=False) for v in issue["values"]) + "."
    return str(issue.get("message", "is not valid."))


def _basename(file: str) -> str:
    return file[file.rfind("/") + 1 :]


def from_schema_issues(
    issues: Sequence[dict[str, Any]], file: str, line_of: LineOf, key_line_of: KeyLineOf
) -> list[ValidationIssue]:
    """Plain-sentence issues with a line where one can be found. Mirrors fromZodError in issues.ts."""
    out: list[ValidationIssue] = []
    for issue in issues:
        path = list(issue["path"])
        if issue["code"] == "unrecognized_keys":
            for key in issue["keys"]:
                out.append(
                    ValidationIssue(
                        file=file,
                        line=key_line_of(path, key),
                        field=field_name([*path, key]),
                        message=f"is not a field in {_basename(file)}. Check the spelling.",
                    )
                )
            continue
        field = field_name(path)
        missing = issue["code"] == "invalid_type" and issue.get("received") == "undefined"
        line = line_of(path[:-1]) if missing else line_of(path)
        out.append(ValidationIssue(file=file, line=line, field=field, message=plain_message(issue, field)))
    return out


def no_line(*_args: Any) -> None:
    return None
