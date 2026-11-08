"""page.md: up to four level-two sections under fixed headings. Mirrors packages/schema/src/page.ts."""

from __future__ import annotations

import re
from typing import Any

from .issues import ValidationIssue
from .jsutil import JS_SPACE_CLASS, trim

PAGE_SECTIONS = ("Where I started", "What I learned", "What I built", "What I am working on next")

#: Text the scaffold puts in a profile or page. A public page may not still contain it.
PLACEHOLDER_PREFIX = "Replace this"

_S = JS_SPACE_CLASS
HEADING = re.compile(rf"^(#{{1,6}}){_S}+(.*?){_S}*#*{_S}*\Z")


def is_placeholder(text: str) -> bool:
    return trim(text).startswith(PLACEHOLDER_PREFIX)


def _allowed() -> str:
    return ", ".join(f'"## {s}"' for s in PAGE_SECTIONS)


def parse_page(text: str, file: str) -> tuple[dict[str, Any], list[ValidationIssue]]:
    """The page's sections, and anything that is not one, reported with its line."""
    issues: list[ValidationIssue] = []
    sections: list[dict[str, Any]] = []
    seen: set[str] = set()
    current: dict[str, Any] | None = None

    def flush() -> None:
        nonlocal current
        if current is not None and current["title"]:
            body = trim("\n".join(current["body"]))
            sections.append(
                {
                    "title": current["title"],
                    "body": body,
                    "line": current["line"],
                    "placeholder": is_placeholder(body),
                }
            )
        current = None

    for i, raw in enumerate(re.split(r"\r?\n", text)):
        line_no = i + 1
        m = HEADING.match(raw)
        if not m:
            if current is not None:
                current["body"].append(raw)
            elif trim(raw) != "":
                issues.append(
                    ValidationIssue(
                        file=file,
                        line=line_no,
                        field="page.md",
                        message=f"has text before the first heading. Every paragraph belongs under one of: {_allowed()}.",
                    )
                )
            continue
        hashes, title = m.group(1), m.group(2)
        known = title if title in PAGE_SECTIONS else None
        flush()
        if len(hashes) == 2 and known:
            if known in seen:
                issues.append(
                    ValidationIssue(
                        file=file,
                        line=line_no,
                        field="heading",
                        message=f'"## {known}" appears twice. Keep one.',
                    )
                )
            seen.add(known)
            current = {"title": known, "line": line_no, "body": []}
            continue
        nearly = next((s for s in PAGE_SECTIONS if s.lower() == title.lower()), None)
        if known:
            message = f'heading must use two hashes: "## {known}".'
        elif nearly:
            message = f'heading must be written exactly as "## {nearly}".'
        else:
            message = f'"{title}" is not a section of a contributor page. Use one of: {_allowed()}.'
        issues.append(ValidationIssue(file=file, line=line_no, field="heading", message=message))
        # Swallow the body under a bad heading so its paragraphs are not reported as stray text too.
        current = {"title": None, "line": line_no, "body": []}
    flush()
    return {"sections": sections}, issues


def publish_issues(page: dict[str, Any], file: str) -> list[ValidationIssue]:
    """Problems that only matter once the owner wants the page published."""
    issues: list[ValidationIssue] = []
    if not any(s["title"] == "Where I started" for s in page["sections"]):
        issues.append(
            ValidationIssue(
                file=file,
                field="heading",
                message='a public page needs a "## Where I started" section. Add it, then write a few sentences under it.',
            )
        )
    for s in page["sections"]:
        if s["placeholder"]:
            issues.append(
                ValidationIssue(
                    file=file,
                    line=s["line"],
                    field=s["title"],
                    message="still has the template text. Write it in your own words, or remove the section.",
                )
            )
        elif s["body"] == "":
            issues.append(
                ValidationIssue(
                    file=file,
                    line=s["line"],
                    field=s["title"],
                    message="is empty. Write a few sentences under it, or remove the heading.",
                )
            )
    return issues


def initials(name: str) -> str:
    """First letter of the first two words, upper-cased."""
    words = [w for w in re.split(_S + "+", trim(name)) if w]
    return "".join(w[0].upper() for w in words[:2])
